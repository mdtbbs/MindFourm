import { BadRequestException, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { readFile, stat, unlink } from 'fs/promises';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { Resource } from '@entities/resource.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceStorageService, StoredResourceFile } from './resource-storage.service';
import { ResourceUploadDraft } from '@entities/resource-upload-draft.entity';
import { normalizeTiptapDocument } from '@common/utils/tiptap-content.util';
import { ResourceDuplicateService, ResourceDuplicateResult } from './resource-duplicate.service';
import { ResourceStorageClientService } from './resource-storage-client.service';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceFileProviderService } from './resource-file-provider.service';
import type { ResourceV2MapObjectOperationInput } from './v2/resources-v2-write.dto';

type RendererResult = {
  metadata?: Record<string, unknown>;
  previewKey?: string;
  parserVersion?: string;
};

export type RendererContentCatalogEntry = {
  internal_name: string;
  display_name: string;
  icon: string | null;
  size?: number;
  size_offset?: number;
  id?: number;
  category?: string;
  category_name?: string;
  placeable?: boolean;
  has_config?: boolean;
  logic?: boolean;
  floor?: boolean;
  overlay?: boolean;
  ore?: boolean;
  liquid_floor?: boolean;
  core?: boolean;
  spawn?: boolean;
  rotatable?: boolean;
  color?: string;
  config_types?: Array<{ type: string; content_type?: string }>;
};

export type RendererContentCatalog = {
  blocks: RendererContentCatalogEntry[];
  items: RendererContentCatalogEntry[];
  liquids: RendererContentCatalogEntry[];
  units: RendererContentCatalogEntry[];
  statuses: RendererContentCatalogEntry[];
  teams: RendererContentCatalogEntry[];
  rule_defaults: Record<string, boolean | number | string | string[]>;
};

const PREVIEW_KEY = /^resources\/(map|schematic)\/([a-f0-9]{2})\/([a-f0-9]{64})\/preview\.png$/;
const PREVIEWABLE_KINDS = new Set(['map', 'schematic']);
const MAX_RENDER_BYTES = 20 * 1024 * 1024;
const DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_DRAFTS_PER_USER = 5;

type RenderableFile = Pick<Resource, 'resource_kind' | 'file_path' | 'file_name' | 'file_size' | 'content_hash'> & { id?: number };
type RenderedPreview = Required<Pick<RendererResult, 'previewKey'>> & Pick<RendererResult, 'metadata' | 'parserVersion'>;
type RenderAttempt = { preview: RenderedPreview | null; errorCode: string };
type PreviewDraft = {
  id: string;
  userId: number;
  kind: string;
  file: StoredResourceFile;
  previewKey: string | null;
  previewObjectId?: string | null;
  previewBindingId?: string | null;
  metadata: Record<string, unknown> | null;
  parserVersion: string | null;
  expiresAt: number;
  draftData: Record<string, unknown> | null;
};

export type ConsumedResourcePreviewDraft = {
  file: StoredResourceFile;
  previewKey: string | null;
  metadata: Record<string, unknown> | null;
  parserVersion: string | null;
};

/**
 * Forum-side client for the bundled Mindustry renderer. The renderer is a
 * loopback-only, restricted Java process; this service is its only public
 * boundary and validates every renderer-supplied storage key before reading it.
 */
@Injectable()
export class ResourcePreviewService {
  private readonly logger = new Logger(ResourcePreviewService.name);
  private readonly drafts = new Map<string, PreviewDraft>();
  private readonly productionBackfills = new Set<number>();
  private readonly productionBackfillAttempts = new Map<number, number>();

  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    private readonly storage?: ResourceStorageService,
    @Optional() @InjectRepository(ResourceUploadDraft) private readonly uploadDrafts?: Repository<ResourceUploadDraft>,
    @Optional() private readonly duplicates?: ResourceDuplicateService,
    @Optional() private readonly resClient?: ResourceStorageClientService,
    @Optional() private readonly fileProvider?: ResourceFileProviderService,
    @Optional() @InjectRepository(ResourceVersion) private readonly versions?: Repository<ResourceVersion>,
  ) {}

  /** Move a newly rendered PNG into RES after the resource has a stable public identity. */
  async storePreviewInRes(resource: Resource, previewKey: string): Promise<void> {
    if (!this.isValidPreviewKey(previewKey, resource.resource_kind, resource.content_hash)) return;
    if (!resource.public_id) throw new BadRequestException('资源公开标识缺失');
    if (!this.resClient?.isAvailable) throw new ServiceUnavailableException('资源存储服务暂不可用，请稍后重试');
    const preview = await readFile(path.resolve(this.previewRoot, previewKey));
    if (!preview.length || preview.length > 10 * 1024 * 1024) throw new BadRequestException('预览文件大小无效');
    const object = await this.resClient.uploadServerGeneratedObject({
      body: preview, sizeBytes: preview.length, mimeType: 'image/png', filename: 'preview.png', purpose: 'resource_preview',
    });
    const visibility = this.isResourcePreviewPublic(resource) ? 'public' : 'private';
    const binding = await this.resClient.createBinding(object.public_id, {
      namespace: 'mindforum', owner_type: 'resource_preview', owner_id: resource.public_id, visibility,
    });
    await this.resources.update(resource.id, {
      renderer_preview_object_id: object.public_id,
      renderer_preview_binding_id: binding.id,
      renderer_preview_key: null,
    });
    // Keep PNGs referenced by historical version metadata.
  }

  async storeVersionPreviewInRes(resource: Resource, version: ResourceVersion, previewKey: string): Promise<{
    renderer_preview_object_id: string; renderer_preview_binding_id: string;
  }> {
    if (!this.isValidPreviewKey(previewKey, resource.resource_kind, version.content_hash)) throw new BadRequestException('版本预览文件无效');
    if (!version.public_id) throw new BadRequestException('版本公开标识缺失');
    if (!this.resClient?.isAvailable) throw new ServiceUnavailableException('资源存储服务暂不可用，请稍后重试');
    const preview = await readFile(path.resolve(this.previewRoot, previewKey));
    if (!preview.length || preview.length > 10 * 1024 * 1024) throw new BadRequestException('预览文件大小无效');
    const object = await this.resClient.uploadServerGeneratedObject({
      body: preview, sizeBytes: preview.length, mimeType: 'image/png', filename: 'preview.png', purpose: 'resource_preview',
    });
    const visibility = this.isVersionPreviewPublic(resource, version) ? 'public' : 'private';
    const binding = await this.resClient.createBinding(object.public_id, {
      namespace: 'mindforum', owner_type: 'resource_version_preview', owner_id: version.public_id, visibility,
    });
    // A renderer key can be shared by historic versions of identical content.
    // Keep local PNGs and metadata keys until a separate migration verifies all references.
    return { renderer_preview_object_id: object.public_id, renderer_preview_binding_id: binding.id };
  }

  private isResourcePreviewPublic(resource: Partial<Resource>): boolean {
    return ['approved', 'published'].includes(resource.status || '') && Number(resource.is_public) === 1
      && resource.visibility !== 'private' && !resource.deleted_at;
  }

  private isVersionPreviewPublic(resource: Resource, version: Pick<ResourceVersion, 'status'>): boolean {
    return this.isResourcePreviewPublic(resource) && version.status === 'published';
  }

  async setVersionResPreviewVisibility(resource: Resource, version: ResourceVersion, visibility: 'public' | 'private', manager?: EntityManager): Promise<void> {
    if (!version.renderer_preview_object_id) return;
    if (!version.public_id) throw new BadRequestException('版本公开标识缺失');
    if (!this.resClient?.isAvailable) throw new ServiceUnavailableException('资源存储服务暂不可用，请稍后重试');
    const binding = await this.resClient.createBinding(version.renderer_preview_object_id, {
      namespace: 'mindforum', owner_type: 'resource_version_preview', owner_id: version.public_id,
      visibility: visibility === 'public' && this.isVersionPreviewPublic(resource, version) ? 'public' : 'private',
    });
    if (version.renderer_preview_binding_id !== binding.id) {
      if (manager) await manager.update(ResourceVersion, version.id, { renderer_preview_binding_id: binding.id });
      else if (this.versions) await this.versions.update(version.id, { renderer_preview_binding_id: binding.id });
    }
    version.renderer_preview_binding_id = binding.id;
  }

  async getVersionResPreviewUrl(resource: Resource, version: ResourceVersion): Promise<string | null> {
    if (!version.renderer_preview_object_id || !this.resClient) return null;
    if (this.isVersionPreviewPublic(resource, version)) return this.resClient.buildPublicDownloadUrl(version.renderer_preview_object_id, 'preview.png');
    return (await this.resClient.createPrivateDownloadUrl(version.renderer_preview_object_id, { filename: 'preview.png', expires_in: 300 })).url;
  }

  async setResPreviewVisibility(resource: Resource, visibility: 'public' | 'private', manager?: EntityManager): Promise<void> {
    if (resource.renderer_preview_object_id) {
      if (!resource.public_id) throw new BadRequestException('资源公开标识缺失');
      if (!this.resClient?.isAvailable) throw new ServiceUnavailableException('资源存储服务暂不可用，请稍后重试');
      const binding = await this.resClient.createBinding(resource.renderer_preview_object_id, {
        namespace: 'mindforum', owner_type: 'resource_preview', owner_id: resource.public_id,
        visibility: visibility === 'public' && this.isResourcePreviewPublic(resource) ? 'public' : 'private',
      });
      if (resource.renderer_preview_binding_id !== binding.id) {
        if (manager) await manager.update(Resource, resource.id, { renderer_preview_binding_id: binding.id });
        else await this.resources.update(resource.id, { renderer_preview_binding_id: binding.id });
      }
    }
    if (this.versions || manager) {
      const versions = manager
        ? await manager.find(ResourceVersion, { where: { resource_id: resource.id } })
        : await this.versions!.find({ where: { resource_id: resource.id } });
      for (const version of versions) await this.setVersionResPreviewVisibility(resource, version, visibility, manager);
    }
  }

  async getResPreviewUrl(resource: Pick<Resource, 'renderer_status' | 'renderer_preview_object_id' | 'status'> & { is_public?: number | boolean; visibility?: string | null; deleted_at?: Date | null }): Promise<string | null> {
    if (resource.renderer_status !== 'ready' || !resource.renderer_preview_object_id || !this.resClient) return null;
    if (this.isResourcePreviewPublic(resource as Partial<Resource>)) {
      return this.resClient.buildPublicDownloadUrl(resource.renderer_preview_object_id, 'preview.png');
    }
    return (await this.resClient.createPrivateDownloadUrl(resource.renderer_preview_object_id, { filename: 'preview.png', expires_in: 300 })).url;
  }

  supports(resource: Pick<Resource, 'resource_kind'>): boolean {
    return PREVIEWABLE_KINDS.has(resource.resource_kind || '');
  }

  /** Read a local editor source with the pinned official renderer without creating a Resource or upload draft. */
  async analyzeEditorFile(kind: 'map' | 'schematic', fileName: string, source: Buffer): Promise<{
    resource_kind: 'map' | 'schematic'; file_name: string; sha256: string; parser_version: string | null;
    renderer_metadata: Record<string, unknown>;
  }> {
    const extension = kind === 'map' ? '.msav' : '.msch';
    if (!fileName.toLowerCase().endsWith(extension) || source.length < (kind === 'map' ? 8 : 5) || source.length > MAX_RENDER_BYTES) {
      throw new BadRequestException(`文件无效或超过 ${MAX_RENDER_BYTES / (1024 * 1024)} MiB 安全上限`);
    }
    if (kind === 'schematic' && source.subarray(0, 4).toString('ascii') !== 'msch') throw new BadRequestException('这不是有效的 Mindustry 蓝图文件');
    if (!this.isConfigured()) throw new ServiceUnavailableException('Mindustry 在线编辑器暂不可用');
    const sha256 = createHash('sha256').update(source).digest('hex');
    try {
      const response = await fetch(`${this.rendererUrl}/v1/analyze`, {
        method: 'POST', headers: {
          'content-type': 'application/json',
          ...(process.env.RESOURCE_RENDERER_TOKEN ? { authorization: `Bearer ${process.env.RESOURCE_RENDERER_TOKEN}` } : {}),
        },
        body: JSON.stringify({ filename: path.basename(fileName).slice(0, 255), resourceType: kind, sha256, dataBase64: source.toString('base64') }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { errorCode?: unknown };
        const code = this.safeErrorCode(body.errorCode);
        const message = kind === 'schematic'
          ? '蓝图无法读取；Mod 内容、未知方块或不支持的格式可能无法在线编辑'
          : '地图无法读取；Mod 内容、未知对象或超过安全尺寸的地图可能无法在线编辑';
        throw new BadRequestException(`${message}（${code}）`);
      }
      const result = await response.json() as RendererResult;
      const metadata = result.metadata && typeof result.metadata === 'object' && !Array.isArray(result.metadata)
        ? this.safeMetadata(result.metadata) : null;
      if (!metadata) throw new ServiceUnavailableException('Renderer 返回了无效的编辑器数据');
      return {
        resource_kind: kind, file_name: path.basename(fileName).slice(0, 255), sha256,
        parser_version: typeof result.parserVersion === 'string' ? result.parserVersion.slice(0, 100) : null,
        renderer_metadata: metadata,
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(`Standalone ${kind} editor analysis failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Mindustry 在线编辑器暂不可用');
    }
  }

  /** The catalog is generated from the same pinned vanilla runtime used by MapIO/Schematics. */
  async resolveContentCatalog(): Promise<RendererContentCatalog> {
    if (!this.isConfigured()) throw new ServiceUnavailableException('Mindustry 内容数据暂不可用');
    try {
      const response = await fetch(`${this.rendererUrl}/v1/content-catalog`, {
        headers: process.env.RESOURCE_RENDERER_TOKEN ? { authorization: `Bearer ${process.env.RESOURCE_RENDERER_TOKEN}` } : undefined,
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`renderer responded ${response.status}`);
      const body = await response.json() as Record<string, unknown>;
      const entryLists = ['blocks', 'items', 'liquids', 'units', 'statuses', 'teams'] as const;
      const catalog = {} as RendererContentCatalog;
      for (const listName of entryLists) {
        const raw = body[listName];
        if (!Array.isArray(raw) || raw.length > 5_000) throw new Error(`invalid ${listName} catalog`);
        const entries = raw.flatMap((value): RendererContentCatalogEntry[] => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
          const row = value as Record<string, unknown>;
          if (typeof row.internal_name !== 'string' || !/^[a-zA-Z0-9_.:-]{1,191}$/.test(row.internal_name)) return [];
          const icon = typeof row.icon === 'string' && row.icon.startsWith('data:image/png;base64,') && row.icon.length <= 100_000 ? row.icon : null;
          const entry: RendererContentCatalogEntry = {
            internal_name: row.internal_name,
            display_name: typeof row.display_name === 'string' && row.display_name.length <= 200 ? row.display_name : row.internal_name,
            icon,
          };
          if (Number.isInteger(row.size) && Number(row.size) >= 1 && Number(row.size) <= 16) entry.size = Number(row.size);
          if (Number.isInteger(row.size_offset) && Math.abs(Number(row.size_offset)) <= 16) entry.size_offset = Number(row.size_offset);
          for (const key of ['category', 'category_name'] as const) if (typeof row[key] === 'string' && row[key].length <= 80) entry[key] = row[key] as string;
          for (const key of ['placeable', 'has_config', 'logic', 'floor', 'overlay', 'ore', 'liquid_floor', 'core', 'spawn', 'rotatable'] as const) {
            if (typeof row[key] === 'boolean') entry[key] = row[key] as boolean;
          }
          if (listName === 'blocks' && Array.isArray(row.config_types) && row.config_types.length <= 32) {
            entry.config_types = row.config_types.flatMap((value) => {
              if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
              const descriptor = value as Record<string, unknown>;
              if (typeof descriptor.type !== 'string' || !/^[a-z_]{1,32}$/.test(descriptor.type)) return [];
              return [{ type: descriptor.type, ...(typeof descriptor.content_type === 'string' && /^[a-z_]{1,32}$/.test(descriptor.content_type) ? { content_type: descriptor.content_type } : {}) }];
            });
          }
          if (typeof row.color === 'string' && /^#[0-9a-fA-F]{8}$/.test(row.color)) entry.color = row.color;
          if (listName === 'teams' && Number.isInteger(row.id) && Number(row.id) >= 0 && Number(row.id) <= 255) entry.id = Number(row.id);
          return [entry];
        });
        catalog[listName] = entries;
      }
      catalog.rule_defaults = this.validateEditorRuleDefaults(body.rule_defaults);
      return catalog;
    } catch (error) {
      this.logger.warn(`Mindustry content catalog unavailable: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Mindustry 内容数据暂不可用');
    }
  }

  private validateEditorRuleDefaults(value: unknown): Record<string, boolean | number | string | string[]> {
    const allowed = new Set([
      'allowEditRules', 'infiniteResources', 'coreBuildAndConfig', 'waveTimer', 'waveSending', 'waves', 'airUseSpawns', 'wavesSpawnAtCores', 'pvp', 'pvpAutoPause', 'pauseDisabled', 'waitEnemies', 'attackMode', 'editor', 'derelictRepair', 'canGameOver', 'coreCapture', 'reactorExplosions', 'possessionAllowed', 'schematicsAllowed', 'damageExplosions', 'fire', 'randomWaveAI', 'unitPayloadUpdate', 'unitPayloadsExplode', 'unitCapVariable', 'hideSpawns', 'ghostBlocks', 'showOtherTeamPings', 'logicUnitControl', 'logicUnitBuild', 'logicUnitDeconstruct', 'worldProcessorPlayerLink', 'allowEditWorldProcessors', 'disableWorldProcessors', 'polygonCoreProtection', 'placeRangeCheck', 'cleanupDeadTeams', 'onlyDepositCore', 'allowCoreUnloaders', 'coreDestroyClear', 'hideBannedBlocks', 'allowEnvironmentDeconstruct', 'instantBuild', 'blockWhitelist', 'unitWhitelist', 'disableUnitCap', 'lighting', 'unitCap', 'winWave', 'environment', 'solarMultiplier', 'unitBuildSpeedMultiplier', 'unitCostMultiplier', 'unitDamageMultiplier', 'unitHealthMultiplier', 'unitCrashDamageMultiplier', 'unitMineSpeedMultiplier', 'unitFactoryActivationDelay', 'blockHealthMultiplier', 'blockDamageMultiplier', 'buildCostMultiplier', 'buildSpeedMultiplier', 'deconstructRefundMultiplier', 'enemyCoreBuildRadius', 'dropZoneRadius', 'waveSpacing', 'initialWaveSpacing', 'itemDepositCooldown', 'modeName', 'bannedBlocks', 'bannedUnits',
    ]);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid rule defaults');
    const defaults: Record<string, boolean | number | string | string[]> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (!allowed.has(key)) continue;
      if (typeof raw === 'boolean' || typeof raw === 'string' && raw.length <= 100
        || typeof raw === 'number' && Number.isFinite(raw)) defaults[key] = raw;
      else if (Array.isArray(raw) && raw.length <= 500 && raw.every((entry) => typeof entry === 'string' && entry.length <= 191)) defaults[key] = raw as string[];
    }
    return defaults;
  }

  /** Generate an empty official Mindustry file through the pinned renderer. */
  async createBlankEditorFile(kind: 'map' | 'schematic', width: number, height: number, name: string, floor = 'stone', template = 'survival'): Promise<{ data: Buffer; sha256: string }> {
    const maximum = kind === 'map' ? 2_000_000 : 16_384;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || width * height > maximum || (kind === 'schematic' && (width > 128 || height > 128))
      || typeof name !== 'string' || !name.trim() || name.length > 120 || /[\u0000-\u001f]/.test(name)) {
      throw new BadRequestException('新建文件的名称或尺寸无效');
    }
    if (kind === 'map' && (!/^[a-zA-Z0-9_.:-]{1,191}$/.test(floor)
      || !['survival', 'sandbox', 'attack', 'pvp', 'custom'].includes(template))) {
      throw new BadRequestException('地图地形或游戏模式模板无效');
    }
    if (!this.isConfigured()) throw new ServiceUnavailableException('Mindustry 在线编辑器暂不可用');
    const endpoint = kind === 'map' ? 'map' : 'schematic';
    try {
      const response = await fetch(`${this.rendererUrl}/v1/create-${endpoint}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.RESOURCE_RENDERER_TOKEN ? { authorization: `Bearer ${process.env.RESOURCE_RENDERER_TOKEN}` } : {}),
        },
        body: JSON.stringify({ width, height, name: name.trim(), ...(kind === 'map' ? { floor, template } : {}) }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new BadRequestException(kind === 'map' ? 'Renderer 无法创建空白地图' : 'Renderer 无法创建空白蓝图');
      const result = await response.json() as { dataBase64?: unknown; sha256?: unknown };
      if (typeof result.dataBase64 !== 'string' || typeof result.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(result.sha256)) {
        throw new ServiceUnavailableException('Renderer 返回了无效的新建文件');
      }
      const data = Buffer.from(result.dataBase64, 'base64');
      const digest = createHash('sha256').update(data).digest('hex');
      if (!data.length || data.length > MAX_RENDER_BYTES || data.toString('base64') !== result.dataBase64 || digest !== result.sha256
        || (kind === 'schematic' && data.subarray(0, 4).toString('ascii') !== 'msch')) {
        throw new ServiceUnavailableException('Renderer 返回了无效的新建文件');
      }
      return { data, sha256: digest };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(`Blank ${kind} editor file creation failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Mindustry 在线编辑器暂不可用');
    }
  }

  /** Transform a schematic through the bundled official Mindustry reader/writer. */
  async transformSchematic(fileName: string, source: Buffer, operations: {
    rotation_quarters: number; mirror_x: boolean; delete_positions: Array<{ x: number; y: number }>;
    move_positions?: Array<{ from_x: number; from_y: number; to_x: number; to_y: number }>;
    rotate_positions?: Array<{ x: number; y: number; rotation_quarters: number }>;
    add_blocks?: Array<{ x: number; y: number; block: string; rotation?: number }>;
    logic_configs?: Array<{ x: number; y: number; source: string }>;
    config_edits?: Array<{ x: number; y: number; config: object }>;
  }): Promise<{ data: Buffer; sha256: string }> {
    if (!this.isConfigured()) throw new ServiceUnavailableException('Mindustry 蓝图编辑器暂不可用');
    const positions = operations?.delete_positions;
    const moves = operations?.move_positions || [];
    const rotations = operations?.rotate_positions || [];
    const additions = operations?.add_blocks || [];
    const logicConfigs = operations?.logic_configs || [];
    const configEdits = operations?.config_edits || [];
    if (!Number.isInteger(operations?.rotation_quarters) || operations.rotation_quarters < 0 || operations.rotation_quarters > 3
      || typeof operations.mirror_x !== 'boolean' || !Array.isArray(positions) || positions.length > 10_000
      || !Array.isArray(moves) || moves.length > 5_000 || !Array.isArray(additions) || additions.length > 5_000
      || !Array.isArray(rotations) || rotations.length > 5_000
      || !Array.isArray(logicConfigs) || logicConfigs.length > 1_000 || !Array.isArray(configEdits) || configEdits.length > 5_000
      || positions.length + moves.length + rotations.length + additions.length + logicConfigs.length + configEdits.length > 10_000
    ) {
      throw new BadRequestException('蓝图编辑操作无效');
    }
    const uniquePositions = new Set<string>();
    for (const position of positions) {
      const key = position && `${position.x}:${position.y}`;
      if (!position || !Number.isInteger(position.x) || !Number.isInteger(position.y)
        || position.x < 0 || position.x > 127 || position.y < 0 || position.y > 127
        || !key || uniquePositions.has(key)) throw new BadRequestException('蓝图编辑操作无效');
      uniquePositions.add(key);
    }
    const moveSources = new Set<string>();
    const moveTargets = new Set<string>();
    for (const move of moves) {
      const sourceKey = move && `${move.from_x}:${move.from_y}`;
      const targetKey = move && `${move.to_x}:${move.to_y}`;
      if (!move || ![move.from_x, move.from_y, move.to_x, move.to_y].every(Number.isInteger)
        || [move.from_x, move.from_y, move.to_x, move.to_y].some((value) => value < 0 || value > 127)
        || !sourceKey || !targetKey || uniquePositions.has(sourceKey) || moveSources.has(sourceKey) || moveTargets.has(targetKey)) {
        throw new BadRequestException('蓝图编辑操作无效');
      }
      moveSources.add(sourceKey);
      moveTargets.add(targetKey);
    }
    const rotationSources = new Set<string>();
    for (const rotation of rotations) {
      const key = rotation && `${rotation.x}:${rotation.y}`;
      if (!rotation || !Number.isInteger(rotation.x) || !Number.isInteger(rotation.y)
        || rotation.x < 0 || rotation.x > 127 || rotation.y < 0 || rotation.y > 127
        || !Number.isInteger(rotation.rotation_quarters) || rotation.rotation_quarters < 1 || rotation.rotation_quarters > 3
        || !key || uniquePositions.has(key) || rotationSources.has(key)) {
        throw new BadRequestException('蓝图编辑操作无效');
      }
      rotationSources.add(key);
    }
    const addedPositions = new Set<string>();
    for (const addition of additions) {
      const key = addition && `${addition.x}:${addition.y}`;
      if (!addition || !Number.isInteger(addition.x) || !Number.isInteger(addition.y)
        || addition.x < 0 || addition.x > 127 || addition.y < 0 || addition.y > 127
        || !/^[a-zA-Z0-9_.:-]{1,191}$/.test(addition.block)
        || (addition.rotation !== undefined && (!Number.isInteger(addition.rotation) || addition.rotation < 0 || addition.rotation > 3))
        || !key || addedPositions.has(key) || moveTargets.has(key)) {
        throw new BadRequestException('蓝图编辑操作无效');
      }
      addedPositions.add(key);
    }
    const logicPositions = new Set<string>();
    for (const edit of logicConfigs) {
      const key = edit && `${edit.x}:${edit.y}`;
      if (!edit || !Number.isInteger(edit.x) || !Number.isInteger(edit.y) || edit.x < 0 || edit.x > 127 || edit.y < 0 || edit.y > 127
        || typeof edit.source !== 'string' || edit.source.length > 32_768 || edit.source.includes('\0')
        || !key || logicPositions.has(key)) throw new BadRequestException('蓝图处理器文本无效');
      logicPositions.add(key);
    }
    const typedConfigPositions = new Set<string>();
    const allowedConfigKeys: Record<string, string[]> = {
      none: ['type'], integer: ['type', 'value'], long: ['type', 'value'], float: ['type', 'value'],
      double: ['type', 'value'], boolean: ['type', 'value'], text: ['type', 'value'],
      content: ['type', 'content_type', 'name'], tech_node: ['type', 'content_type', 'name'],
      point: ['type', 'x', 'y'], point_array: ['type', 'points'], int_seq: ['type', 'values'],
      int_array: ['type', 'values'], boolean_array: ['type', 'values'], vec2: ['type', 'x', 'y'],
      vec2_array: ['type', 'points'], team: ['type', 'name'], l_access: ['type', 'name'],
      unit_command: ['type', 'name'], color: ['type', 'value'],
    };
    for (const edit of configEdits) {
      const key = edit && `${edit.x}:${edit.y}`;
      const config = edit?.config as Record<string, unknown> | undefined;
      if (!edit || !Number.isInteger(edit.x) || !Number.isInteger(edit.y) || edit.x < 0 || edit.x > 127 || edit.y < 0 || edit.y > 127
        || !key || typedConfigPositions.has(key) || logicPositions.has(key) || !config || typeof config !== 'object' || Array.isArray(config)) {
        throw new BadRequestException('蓝图配置编辑无效');
      }
      const type = config.type;
      if (typeof type !== 'string' || !allowedConfigKeys[type]
        || Object.keys(config).some((property) => !allowedConfigKeys[type].includes(property))
        || allowedConfigKeys[type].some((property) => !(property in config))) {
        throw new BadRequestException('蓝图配置类型或字段无效');
      }
      typedConfigPositions.add(key);
    }
    if (!fileName.toLowerCase().endsWith('.msch') || source.length < 5 || source.length > MAX_RENDER_BYTES
      || source.subarray(0, 4).toString('ascii') !== 'msch') {
      throw new BadRequestException('蓝图文件无效或超过大小限制');
    }
    const sourceHash = createHash('sha256').update(source).digest('hex');
    try {
      const response = await fetch(`${this.rendererUrl}/v2/transform-schematic`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.RESOURCE_RENDERER_TOKEN ? { authorization: `Bearer ${process.env.RESOURCE_RENDERER_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          filename: fileName,
          sha256: sourceHash,
          dataBase64: source.toString('base64'),
          rotation_quarters: operations.rotation_quarters,
          mirror_x: operations.mirror_x,
          delete_positions: operations.delete_positions,
          move_positions: moves,
          rotate_positions: rotations,
          add_blocks: additions,
          logic_configs: logicConfigs,
          config_edits: configEdits,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { errorCode?: unknown };
        const code = typeof error.errorCode === 'string' ? error.errorCode : '';
        if (['INVALID_SCHEMATIC_OPERATION', 'UNSUPPORTED_SCHEMATIC_CONTENT', 'UNSUPPORTED_SCHEMATIC_FORMAT', 'INVALID_SCHEMATIC', 'INVALID_FILE'].includes(code)) {
          throw new BadRequestException(code === 'UNSUPPORTED_SCHEMATIC_CONTENT'
            ? '蓝图包含当前编辑器无法安全保留的 Mod 方块或配置，未生成文件'
            : code === 'UNSUPPORTED_SCHEMATIC_FORMAT'
              ? '此蓝图格式暂不支持安全编辑，未生成文件'
              : '蓝图编辑操作无效或文件无法解析');
        }
        throw new ServiceUnavailableException('Mindustry 蓝图编辑器暂不可用');
      }
      const result = await response.json() as { dataBase64?: unknown; sha256?: unknown };
      if (typeof result.dataBase64 !== 'string' || typeof result.sha256 !== 'string'
        || !/^[a-f0-9]{64}$/.test(result.sha256)) throw new ServiceUnavailableException('Mindustry 蓝图编辑器返回了无效结果');
      const data = Buffer.from(result.dataBase64, 'base64');
      const digest = createHash('sha256').update(data).digest('hex');
      if (!data.length || data.length > MAX_RENDER_BYTES || data.subarray(0, 4).toString('ascii') !== 'msch'
        || data.toString('base64') !== result.dataBase64 || digest !== result.sha256) {
        throw new ServiceUnavailableException('Mindustry 蓝图编辑器返回了无效结果');
      }
      return { data, sha256: digest };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(`Schematic transform failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Mindustry 蓝图编辑器暂不可用');
    }
  }

  /** Transform a derived map through official MapIO and retain unknown Rules/wave JSON fields. */
  async transformMap(fileName: string, source: Buffer, operations: {
    terrain_changes?: Array<{ x: number; y: number; floor: string; overlay: string }>;
    rule_changes?: Record<string, unknown>;
    wave_operations?: Array<{ action: 'add' | 'update' | 'delete' | 'move'; index: number; to_index?: number; fields?: Record<string, unknown> }>;
    object_operations?: ResourceV2MapObjectOperationInput[];
  }): Promise<{ data: Buffer; sha256: string }> {
    if (!this.isConfigured()) throw new ServiceUnavailableException('Mindustry 地图编辑器暂不可用');
    const terrain = operations?.terrain_changes || [];
    const waves = operations?.wave_operations || [];
    const objects = operations?.object_operations || [];
    const rules = operations?.rule_changes || {};
    if (!Array.isArray(terrain) || terrain.length > 5_000 || !Array.isArray(waves) || waves.length > 1_000
      || !Array.isArray(objects) || objects.length > 2_000
      || !rules || typeof rules !== 'object' || Array.isArray(rules) || Object.keys(rules).length > 100) {
      throw new BadRequestException('地图编辑操作无效');
    }
    const positions = new Set<string>();
    for (const change of terrain) {
      const key = change && `${change.x}:${change.y}`;
      if (!change || !Number.isInteger(change.x) || !Number.isInteger(change.y)
        || change.x < 0 || change.y < 0 || change.x > 32_767 || change.y > 32_767
        || !/^[a-zA-Z0-9_.:-]{1,191}$/.test(change.floor)
        || typeof change.overlay !== 'string' || change.overlay.length > 191
        || (change.overlay !== '' && !/^[a-zA-Z0-9_.:-]{1,191}$/.test(change.overlay))
        || !key || positions.has(key)) throw new BadRequestException('地图地形编辑操作无效');
      positions.add(key);
    }
    for (const operation of waves) {
      if (!operation || !['add', 'update', 'delete', 'move'].includes(operation.action)
        || !Number.isInteger(operation.index) || operation.index < 0 || operation.index > 5_000
        || (operation.action === 'move' && (!Number.isInteger(operation.to_index) || operation.to_index! < 0 || operation.to_index! > 5_000))
        || (['add', 'update'].includes(operation.action) && (!operation.fields || typeof operation.fields !== 'object' || Array.isArray(operation.fields)))) {
        throw new BadRequestException('地图波次编辑操作无效');
      }
    }
    const objectActions = new Set(['add', 'delete', 'move', 'team']);
    const objectTypes = new Set(['core', 'spawn', 'building']);
    for (const operation of objects) {
      if (!operation || !objectActions.has(String(operation.action)) || !objectTypes.has(String(operation.object_type))) {
        throw new BadRequestException('地图对象编辑操作无效');
      }
      const coords = operation.action === 'move'
        ? [operation.from_x, operation.from_y, operation.to_x, operation.to_y]
        : [operation.x, operation.y];
      if (!coords.every(value => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 32_767)) {
        throw new BadRequestException('地图对象编辑坐标无效');
      }
      if (operation.action === 'add'
        && (typeof operation.name !== 'string' || !/^[a-zA-Z0-9_.:-]{1,191}$/.test(operation.name)
          || (operation.object_type !== 'spawn' && (typeof operation.team !== 'string' || !/^[a-zA-Z0-9_#-]{1,40}$/.test(operation.team)))
          || (operation.object_type === 'spawn' && (operation.team !== undefined || (operation.rotation !== undefined && operation.rotation !== 0)))
          || (operation.rotation !== undefined && (!Number.isInteger(operation.rotation) || Number(operation.rotation) < 0 || Number(operation.rotation) > 3)))) {
        throw new BadRequestException('地图对象编辑内容无效');
      }
      if (operation.action === 'team' && (!['core', 'building'].includes(String(operation.object_type))
        || typeof operation.team !== 'string' || !/^[a-zA-Z0-9_#-]{1,40}$/.test(operation.team))) {
        throw new BadRequestException('地图对象队伍无效');
      }
    }
    if (Buffer.byteLength(JSON.stringify({ rules, waves, objects })) > 512 * 1024
      || !fileName.toLowerCase().endsWith('.msav') || source.length < 8 || source.length > MAX_RENDER_BYTES) {
      throw new BadRequestException('地图文件无效或编辑数据超过大小限制');
    }
    const sourceHash = createHash('sha256').update(source).digest('hex');
    try {
      const response = await fetch(`${this.rendererUrl}/v2/transform-map`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.RESOURCE_RENDERER_TOKEN ? { authorization: `Bearer ${process.env.RESOURCE_RENDERER_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          filename: fileName,
          sha256: sourceHash,
          dataBase64: source.toString('base64'),
          terrain_changes: terrain,
          rule_changes: rules,
          wave_operations: waves,
          object_operations: objects,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({})) as { errorCode?: unknown };
        const code = typeof error.errorCode === 'string' ? error.errorCode : '';
        if ([
          'INVALID_MAP_OPERATION', 'INVALID_WAVE_OPERATION', 'UNSUPPORTED_MAP_CONTENT', 'UNSUPPORTED_MAP_SIZE',
          'UNSUPPORTED_MAP_OBJECT', 'INVALID_MAP_OBJECT_OPERATION', 'UNSUPPORTED_MAP_RULES', 'INVALID_MAP_RULES', 'INVALID_MAP', 'INVALID_FILE',
        ].includes(code)) {
          const message = code === 'UNSUPPORTED_MAP_CONTENT'
            ? '地图包含当前编辑器无法安全保留的 Mod 或未知内容，未生成文件'
            : code === 'UNSUPPORTED_MAP_SIZE'
              ? '地图尺寸超过当前安全编辑上限，未生成文件'
              : code === 'UNSUPPORTED_MAP_RULES'
                ? '地图规则格式无法安全保留，未生成文件'
                : '地图编辑操作无效或文件无法解析';
          throw new BadRequestException(message);
        }
        throw new ServiceUnavailableException('Mindustry 地图编辑器暂不可用');
      }
      const result = await response.json() as { dataBase64?: unknown; sha256?: unknown };
      if (typeof result.dataBase64 !== 'string' || typeof result.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(result.sha256)) {
        throw new ServiceUnavailableException('Mindustry 地图编辑器返回了无效结果');
      }
      const data = Buffer.from(result.dataBase64, 'base64');
      const digest = createHash('sha256').update(data).digest('hex');
      if (!data.length || data.length > MAX_RENDER_BYTES
        || data.toString('base64') !== result.dataBase64 || digest !== result.sha256) {
        throw new ServiceUnavailableException('Mindustry 地图编辑器返回了无效结果');
      }
      return { data, sha256: digest };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(`Map transform failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Mindustry 地图编辑器暂不可用');
    }
  }

  isConfigured(): boolean {
    return Boolean(process.env.RESOURCE_RENDERER_URL);
  }

  async resolveContentMetadata(items: string[], blocks: string[], liquids: string[] = []): Promise<{
    items: Record<string, { name: string; icon: string | null }>;
    blocks: Record<string, { name: string; icon: string | null }>;
    liquids: Record<string, { name: string; icon: string | null }>;
  }> {
    const normalize = (ids: string[]) => [...new Set(ids)]
      .filter((id) => /^[a-zA-Z0-9_.-]{1,100}$/.test(id))
      .slice(0, 100);
    const safeItems = normalize(items);
    const safeBlocks = normalize(blocks);
    const safeLiquids = normalize(liquids);
    if (!this.isConfigured()) return { items: {}, blocks: {}, liquids: {} };
    const query = new URLSearchParams({ items: safeItems.join(','), blocks: safeBlocks.join(','), liquids: safeLiquids.join(',') });
    try {
      const response = await fetch(`${this.rendererUrl}/v1/content-metadata?${query}`, {
        headers: process.env.RESOURCE_RENDERER_TOKEN
          ? { authorization: `Bearer ${process.env.RESOURCE_RENDERER_TOKEN}` }
          : {},
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`renderer responded ${response.status}`);
      const body = await response.json() as { items?: unknown; blocks?: unknown; liquids?: unknown };
      return {
        items: this.validateContentMetadata(body.items, safeItems),
        blocks: this.validateContentMetadata(body.blocks, safeBlocks),
        liquids: this.validateContentMetadata(body.liquids, safeLiquids),
      };
    } catch (error) {
      this.logger.warn(`Mindustry content metadata unavailable: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Mindustry 内容数据暂不可用');
    }
  }

  private validateContentMetadata(value: unknown, allowedIds: string[]): Record<string, { name: string; icon: string | null }> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: Record<string, { name: string; icon: string | null }> = {};
    for (const id of allowedIds) {
      const entry = (value as Record<string, unknown>)[id];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const name = typeof record.name === 'string' && record.name.length <= 200 ? record.name : id;
      const icon = typeof record.icon === 'string' && record.icon.startsWith('data:image/png;base64,')
        && record.icon.length <= 100_000 ? record.icon : null;
      result[id] = { name, icon };
    }
    return result;
  }

  /**
   * Render an authenticated, not-yet-submitted map/blueprint. Its file remains
   * in the ordinary resource quarantine and is accessible only through a
   * short-lived, user-bound draft identifier.
   */
  async createDraft(userId: number, kind: 'map' | 'schematic', file: StoredResourceFile): Promise<{
    id: string; preview_url: string; metadata: Record<string, unknown> | null; parser_version: string | null; expires_at: string; duplicate: ResourceDuplicateResult | null;
  }> {
    await this.pruneExpiredDrafts();
    if (!this.supports({ resource_kind: kind })) throw new BadRequestException('该资源类型不支持预览');
    if (!this.isConfigured()) throw new BadRequestException('预览服务暂不可用，请稍后重试');
    if (file.file_size <= 0 || file.file_size > MAX_RENDER_BYTES) throw new BadRequestException('文件大小不支持生成预览');
    await this.makeRoomForDraft(userId);
    if (!this.resClient?.isAvailable) throw new ServiceUnavailableException('资源存储服务暂不可用，请稍后重试');

    const rendered = await this.render({ resource_kind: kind, ...file });
    if (!rendered.preview) throw new BadRequestException('文件无法解析为有效的 Mindustry 地图或蓝图');
    const metadata = this.safeMetadata(rendered.preview.metadata);
    const duplicate = this.duplicates ? await this.duplicates.inspect({
      contentHash: file.content_hash,
      structureHash: typeof metadata?.structure_hash === 'string' ? metadata.structure_hash : null,
      normalizedStructureHash: typeof metadata?.normalized_structure_hash === 'string' ? metadata.normalized_structure_hash : null,
      resourceKind: kind,
    }) : null;

    const id = randomUUID();
    const expiresAt = Date.now() + DRAFT_TTL_MS;
    const draft: PreviewDraft = {
      id, userId, kind, file, previewKey: rendered.preview.previewKey,
      metadata,
      parserVersion: typeof rendered.preview.parserVersion === 'string' ? rendered.preview.parserVersion.slice(0, 100) : null,
      expiresAt,
      draftData: null,
    };
    try {
      const preview = await this.readPreviewKey(rendered.preview.previewKey);
      if (!preview.length || preview.length > 10 * 1024 * 1024) throw new BadRequestException('预览文件大小无效');
      const object = await this.resClient.uploadServerGeneratedObject({
        body: preview, sizeBytes: preview.length, mimeType: 'image/png', filename: 'preview.png', purpose: 'resource_preview',
      });
      const binding = await this.resClient.createBinding(object.public_id, {
        namespace: 'mindforum', owner_type: 'resource_preview_draft', owner_id: id, visibility: 'private',
      });
      draft.previewObjectId = object.public_id;
      draft.previewBindingId = binding.id;
      await this.storeDraft(draft);
    } catch (error) {
      await this.removeDraftPreviewBinding(draft);
      await this.removePreviewKey(draft.previewKey);
      throw error;
    }
    return {
      id,
      preview_url: `/api/resources/drafts/${id}/preview`,
      metadata,
      parser_version: typeof rendered.preview.parserVersion === 'string' ? rendered.preview.parserVersion.slice(0, 100) : null,
      expires_at: new Date(expiresAt).toISOString(),
      duplicate,
    };
  }

  /** Generic resource files use the same durable quarantine draft without a game renderer. */
  async createUploadDraft(userId: number, kind: string, file: StoredResourceFile) {
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(kind)) throw new BadRequestException('资源类型格式不正确');
    await this.pruneExpiredDrafts();
    await this.makeRoomForDraft(userId);
    const draft: PreviewDraft = {
      id: randomUUID(), userId, kind, file, previewKey: null, metadata: null,
      parserVersion: null, expiresAt: Date.now() + DRAFT_TTL_MS, draftData: null,
    };
    await this.storeDraft(draft);
    const duplicate = this.duplicates ? await this.duplicates.inspect({ contentHash: file.content_hash, resourceKind: kind }) : null;
    return { ...this.publicDraft(draft), duplicate };
  }

  async getDraft(userId: number, id: string) {
    return this.publicDraft(await this.requireDraft(userId, id));
  }

  async updateDraft(userId: number, id: string, draftData: Record<string, unknown>) {
    const draft = await this.requireDraft(userId, id);
    if (draftData.content_json !== undefined) {
      draftData = { ...draftData, content_json: normalizeTiptapDocument(draftData.content_json) };
    }
    draft.draftData = { ...(draft.draftData || {}), ...draftData };
    if (this.uploadDrafts) await this.uploadDrafts.update({ id, user_id: userId }, { draft_json: draft.draftData as any });
    else this.drafts.set(id, draft);
    return this.publicDraft(draft);
  }

  async deleteUserDraft(userId: number, id: string): Promise<void> {
    const draft = await this.requireDraft(userId, id);
    if (this.uploadDrafts) await this.uploadDrafts.delete({ id, user_id: userId });
    else this.drafts.delete(id);
    await this.cleanupDraftFiles(draft);
  }

  async getDraftResPreviewUrl(userId: number, id: string): Promise<string | null> {
    const draft = await this.requireDraft(userId, id);
    if (!draft.previewObjectId) return null;
    if (!this.resClient?.isAvailable) throw new ServiceUnavailableException('资源存储服务暂不可用，请稍后重试');
    return (await this.resClient.createPrivateDownloadUrl(draft.previewObjectId, { filename: 'preview.png', expires_in: 300 })).url;
  }

  async readDraftPreview(userId: number, id: string): Promise<Buffer> {
    const draft = await this.requireDraft(userId, id);
    if (!draft.previewKey) throw new NotFoundException('预览尚未生成');
    try {
      return await readFile(path.resolve(this.previewRoot, draft.previewKey));
    } catch {
      throw new NotFoundException('预览已失效，请重新生成');
    }
  }

  async takeDraft(userId: number, id: string, kind: string): Promise<StoredResourceFile> {
    return (await this.consumeDraft(userId, id, kind)).file;
  }

  async consumeDraft(userId: number, id: string, kind: string): Promise<ConsumedResourcePreviewDraft> {
    const draft = await this.requireDraft(userId, id);
    if (draft.kind !== kind) throw new BadRequestException('预览草稿与资源类型不匹配');
    if (this.uploadDrafts) {
      const deleted = await this.uploadDrafts.delete({ id, user_id: userId, expires_at: MoreThan(new Date()) });
      if (!deleted.affected) throw new NotFoundException('预览草稿不存在或已过期');
    } else this.drafts.delete(id);
    await this.removeDraftPreviewBinding(draft);
    return { file: draft.file, previewKey: draft.previewKey, metadata: draft.metadata, parserVersion: draft.parserVersion };
  }

  async discardConsumedDraft(draft: ConsumedResourcePreviewDraft): Promise<void> {
    if (!draft.previewKey || !this.isValidPreviewKey(draft.previewKey)) return;
    await this.removePreviewKey(draft.previewKey);
  }

  async enqueue(resource: Pick<Resource, 'id' | 'resource_kind' | 'file_path' | 'file_name' | 'file_size' | 'content_hash'>): Promise<void> {
    if (!this.supports(resource)) return;
    if (!this.isConfigured()) {
      await this.resources.update(resource.id, { renderer_status: 'unavailable', renderer_error_code: 'RENDERER_UNAVAILABLE' });
      return;
    }
    if (!resource.file_name || !resource.content_hash) {
      await this.fail(resource.id, 'RENDER_SOURCE_MISSING');
      return;
    }
    if (resource.file_size > MAX_RENDER_BYTES) {
      await this.resources.update(resource.id, { renderer_status: 'unavailable', renderer_error_code: 'FILE_TOO_LARGE_FOR_PREVIEW' });
      return;
    }

    await this.resources.update(resource.id, {
      renderer_status: 'processing', renderer_error_code: null, renderer_preview_key: null,
    });
    const rendered = await this.render(resource);
    if (!rendered.preview) {
      await this.fail(resource.id, rendered.errorCode);
      return;
    }
    try {
      await this.resources.update(resource.id, {
        renderer_status: 'ready',
        renderer_error_code: null,
        renderer_preview_key: rendered.preview.previewKey,
        renderer_parser_version: typeof rendered.preview.parserVersion === 'string' ? rendered.preview.parserVersion.slice(0, 100) : null,
        renderer_metadata_json: this.safeMetadata(rendered.preview.metadata) as any,
      });
      if (this.resClient) {
        const owner = await this.resources.findOne({ where: { id: resource.id } });
        if (!owner) throw new NotFoundException('资源不存在');
        await this.storePreviewInRes(owner, rendered.preview.previewKey);
      }
    } catch { await this.fail(resource.id, 'RENDER_FAILED'); }
  }

  /** Rebuilds legacy schematic metadata at most once per resource per process. */
  ensureProduction(resource: Pick<Resource, 'id' | 'resource_kind' | 'file_path' | 'file_name' | 'file_size' | 'content_hash' | 'renderer_status' | 'renderer_metadata_json'>): void {
    if (resource.resource_kind !== 'schematic' || resource.renderer_status !== 'ready' || !this.isConfigured()) return;
    const now = Date.now();
    for (const [id, attemptedAt] of this.productionBackfillAttempts) if (now - attemptedAt > 60 * 60 * 1000) this.productionBackfillAttempts.delete(id);
    const existingProduction = resource.renderer_metadata_json?.production;
    if ((existingProduction && typeof existingProduction === 'object' && !Array.isArray(existingProduction)) || this.productionBackfills.has(resource.id)
      || (this.productionBackfillAttempts.get(resource.id) && now - this.productionBackfillAttempts.get(resource.id)! < 60 * 60 * 1000)
      || this.productionBackfills.size >= 24) return;
    if (this.productionBackfillAttempts.size >= 500) this.productionBackfillAttempts.delete(this.productionBackfillAttempts.keys().next().value!);
    this.productionBackfillAttempts.set(resource.id, now);
    this.productionBackfills.add(resource.id);
    void (async () => {
      try {
        const rendered = await this.render(resource);
        if (!rendered.preview?.metadata?.production || typeof rendered.preview.metadata.production !== 'object') return;
        await this.resources.update(resource.id, {
          renderer_metadata_json: this.safeMetadata(rendered.preview.metadata) as any,
          renderer_parser_version: typeof rendered.preview.parserVersion === 'string' ? rendered.preview.parserVersion.slice(0, 100) : null,
        });
      } catch (error) {
        this.logger.warn(`Mindustry production metadata backfill failed for resource ${resource.id}: ${(error as Error).message}`);
      } finally {
        this.productionBackfills.delete(resource.id);
      }
    })();
  }

  async readPreview(resource: Pick<Resource, 'renderer_status' | 'renderer_preview_key'>): Promise<Buffer | null> {
    if (resource.renderer_status !== 'ready' || !this.isValidPreviewKey(resource.renderer_preview_key)) return null;
    try {
      return await readFile(path.resolve(this.previewRoot, resource.renderer_preview_key));
    } catch {
      return null;
    }
  }

  async readPreviewKey(previewKey: string): Promise<Buffer> {
    if (!this.isValidPreviewKey(previewKey)) throw new NotFoundException('预览不存在');
    try { return await readFile(path.resolve(this.previewRoot, previewKey)); }
    catch { throw new NotFoundException('预览不存在'); }
  }

  async removePreviewKey(previewKey: string | null | undefined): Promise<void> {
    if (!previewKey || !this.isValidPreviewKey(previewKey)) return;
    // Identical content shares a renderer key. Draft cleanup must not erase an
    // already published historic version's PNG. Retain it if reference checks fail.
    if (this.resources.manager?.query) {
      try {
        const references = await this.resources.manager.query(
          `SELECT id FROM resources WHERE renderer_preview_key = ?
           UNION ALL SELECT resource_version_id AS id FROM map_version_metadata WHERE preview_key = ?
           UNION ALL SELECT resource_version_id AS id FROM schematic_version_metadata WHERE preview_key = ? LIMIT 1`,
          [previewKey, previewKey, previewKey],
        );
        if (references.length) return;
      } catch { return; }
    }
    await unlink(path.resolve(this.previewRoot, previewKey)).catch(() => undefined);
  }

  private get rendererUrl(): string { return (process.env.RESOURCE_RENDERER_URL || '').replace(/\/$/, ''); }
  private get previewRoot(): string {
    return path.resolve(process.env.RESOURCE_PREVIEW_ROOT || path.join(process.env.RESOURCE_UPLOAD_ROOT || './uploads', 'previews'));
  }

  private isValidPreviewKey(value: unknown, expectedKind?: string | null, expectedHash?: string | null): value is string {
    if (typeof value !== 'string') return false;
    const match = value.match(PREVIEW_KEY);
    return !!match && (!expectedKind || match[1] === expectedKind) && (!expectedHash || match[3] === expectedHash.toLowerCase());
  }

  private safeMetadata(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const allowed = new Set([
      'name', 'author', 'description', 'width', 'height', 'spawns', 'version', 'build',
      'planet', 'game_modes', 'teams', 'tags', 'mod_dependencies', 'waves', 'wave_groups',
      'banned_blocks', 'banned_units', 'rules', 'core_count', 'cores', 'core_teams', 'tile_layers', 'tile_layers_truncated', 'unknown_content', 'blocks', 'block_count', 'block_types',
      'block_positions', 'block_positions_truncated', 'requirements', 'power_production',
      'power_consumption', 'net_power', 'labels', 'production',
    ]);
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (!allowed.has(key)) continue;
      // Mindustry's map reader uses build 1 as a fallback for files without a
      // trustworthy build marker. Never persist that sentinel as compatibility.
      if (key === 'build' && typeof item === 'number' && item <= 1) continue;
      const safe = this.sanitizeMetadataValue(item);
      if (safe !== undefined) result[key] = safe;
    }
    return result;
  }

  private sanitizeMetadataValue(value: unknown, depth = 0): unknown {
    if (depth > 4) return undefined;
    if (typeof value === 'string') return value.slice(0, 32_768);
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'boolean' || value === null) return value;
    if (Array.isArray(value)) {
      return value.slice(0, 10_000)
        .map((item) => this.sanitizeMetadataValue(item, depth + 1))
        .filter((item) => item !== undefined);
    }
    if (typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [key.slice(0, 100), this.sanitizeMetadataValue(item, depth + 1)])
        .filter(([, item]) => item !== undefined));
    }
    return undefined;
  }

  private safeErrorCode(value: unknown): string {
    return typeof value === 'string' && /^[A-Z0-9_]{1,100}$/.test(value) ? value : 'RENDER_FAILED';
  }

  private async fail(id: number, errorCode: string): Promise<void> {
    await this.resources.update(id, { renderer_status: 'failed', renderer_error_code: errorCode, renderer_preview_key: null });
  }

  private async render(resource: RenderableFile): Promise<RenderAttempt> {
    try {
      if (!resource.file_name || !resource.content_hash) return { preview: null, errorCode: 'RENDER_SOURCE_MISSING' };
      let payload: Buffer;
      if (resource.file_path) {
        const source = await stat(resource.file_path);
        if (!source.isFile() || source.size > MAX_RENDER_BYTES) return { preview: null, errorCode: 'FILE_TOO_LARGE_FOR_PREVIEW' };
        payload = await readFile(resource.file_path);
      }
      else if (resource.id && this.fileProvider) {
        const file = await this.resources.manager.getRepository(ResourceFile).findOne({
          where: { role: 'primary', resource_version: { resource_id: resource.id } }, order: { id: 'DESC' },
        });
        if (!file) return { preview: null, errorCode: 'RENDER_SOURCE_MISSING' };
        payload = await this.fileProvider.getReadableContent(file, MAX_RENDER_BYTES);
      } else return { preview: null, errorCode: 'RENDER_SOURCE_MISSING' };
      if (payload.length === 0 || payload.length > MAX_RENDER_BYTES) return { preview: null, errorCode: 'FILE_TOO_LARGE_FOR_PREVIEW' };
      const response = await fetch(`${this.rendererUrl}/v1/analyze`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.RESOURCE_RENDERER_TOKEN ? { authorization: `Bearer ${process.env.RESOURCE_RENDERER_TOKEN}` } : {}),
        },
        body: JSON.stringify({ filename: resource.file_name, resourceType: resource.resource_kind, sha256: resource.content_hash, dataBase64: payload.toString('base64') }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { errorCode?: unknown };
        this.logger.warn(`Resource renderer rejected ${resource.file_name}: ${this.safeErrorCode(body.errorCode)}`);
        return { preview: null, errorCode: this.safeErrorCode(body.errorCode) };
      }
      const result = await response.json() as RendererResult;
      return this.isValidPreviewKey(result.previewKey, resource.resource_kind, resource.content_hash)
        ? { preview: result as RenderedPreview, errorCode: 'OK' }
        : { preview: null, errorCode: 'INVALID_RENDER_RESULT' };
    } catch (error) {
      this.logger.warn(`Resource preview failed: ${(error as Error).message}`);
      return { preview: null, errorCode: 'RENDER_FAILED' };
    }
  }

  private async requireDraft(userId: number, id: string): Promise<PreviewDraft> {
    await this.pruneExpiredDrafts();
    if (this.uploadDrafts) {
      const row = await this.uploadDrafts.findOne({ where: { id, user_id: userId, expires_at: MoreThan(new Date()) } });
      if (!row) throw new NotFoundException('预览草稿不存在或已过期');
      return this.fromUploadDraft(row);
    }
    const draft = this.drafts.get(id);
    if (!draft || draft.userId !== userId) throw new NotFoundException('预览草稿不存在或已过期');
    return draft;
  }

  private async pruneExpiredDrafts(): Promise<void> {
    const now = Date.now();
    if (this.uploadDrafts) {
      const expired = await this.uploadDrafts.find({ where: { expires_at: LessThanOrEqual(new Date(now)) }, take: 250 });
      for (const row of expired) await this.cleanupDraftFiles(this.fromUploadDraft(row));
      if (expired.length) await this.uploadDrafts.delete(expired.map(({ id }) => id));
      return;
    }
    for (const [id, draft] of this.drafts) {
      if (draft.expiresAt > now) continue;
      await this.deleteDraft(id, draft);
    }
  }

  /** Keep previews disposable: replacing a file should never strand a user at a draft quota. */
  private async makeRoomForDraft(userId: number): Promise<void> {
    if (this.uploadDrafts) {
      const active = await this.uploadDrafts.find({
        where: { user_id: userId, expires_at: MoreThan(new Date()) },
        order: { created_at: 'ASC' },
        take: MAX_DRAFTS_PER_USER,
      });
      if (active.length >= MAX_DRAFTS_PER_USER) {
        const oldest = active[0];
        await this.uploadDrafts.delete({ id: oldest.id, user_id: userId });
        await this.cleanupDraftFiles(this.fromUploadDraft(oldest));
      }
      return;
    }
    const ownDrafts = [...this.drafts.values()]
      .filter((draft) => draft.userId === userId)
      .sort((left, right) => left.expiresAt - right.expiresAt);
    while (ownDrafts.length >= MAX_DRAFTS_PER_USER) {
      const oldest = ownDrafts.shift();
      if (oldest) await this.deleteDraft(oldest.id, oldest);
    }
  }

  private async deleteDraft(id: string, draft: PreviewDraft): Promise<void> {
    this.drafts.delete(id);
    if (this.uploadDrafts) await this.uploadDrafts.delete({ id });
    await this.cleanupDraftFiles(draft);
  }

  private async storeDraft(draft: PreviewDraft): Promise<void> {
    if (!this.uploadDrafts) {
      this.drafts.set(draft.id, draft);
      return;
    }
    await this.uploadDrafts.save({
      id: draft.id,
      user_id: draft.userId,
      resource_kind: draft.kind,
      file_path: draft.file.file_path,
      file_name: draft.file.file_name,
      file_size: draft.file.file_size,
      mime_type: draft.file.mime_type,
      content_hash: draft.file.content_hash,
      preview_key: draft.previewKey,
      preview_object_id: draft.previewObjectId || null,
      preview_binding_id: draft.previewBindingId || null,
      metadata_json: draft.metadata,
      parser_version: draft.parserVersion,
      draft_json: draft.draftData,
      expires_at: new Date(draft.expiresAt),
    });
  }

  private fromUploadDraft(row: ResourceUploadDraft): PreviewDraft {
    return {
      id: row.id,
      userId: row.user_id,
      kind: row.resource_kind,
      file: {
        file_path: row.file_path,
        file_name: row.file_name,
        file_size: Number(row.file_size),
        mime_type: row.mime_type,
        content_hash: row.content_hash,
      },
      previewKey: row.preview_key,
      previewObjectId: row.preview_object_id || null,
      previewBindingId: row.preview_binding_id || null,
      metadata: row.metadata_json || null,
      parserVersion: row.parser_version || null,
      expiresAt: new Date(row.expires_at).getTime(),
      draftData: row.draft_json || null,
    };
  }

  private publicDraft(draft: PreviewDraft) {
    return {
      id: draft.id,
      resource_kind: draft.kind,
      file_name: draft.file.file_name,
      file_size: draft.file.file_size,
      content_hash: draft.file.content_hash,
      preview_url: draft.previewKey ? `/api/resources/drafts/${draft.id}/preview` : null,
      metadata: draft.metadata,
      parser_version: draft.parserVersion,
      draft: draft.draftData,
      expires_at: new Date(draft.expiresAt).toISOString(),
    };
  }

  private async removeDraftPreviewBinding(draft: PreviewDraft): Promise<void> {
    if (draft.previewObjectId && draft.previewBindingId && this.resClient) {
      await this.resClient.deleteBinding(draft.previewObjectId, draft.previewBindingId).catch(() => {
        this.logger.warn('Draft preview binding cleanup failed; retained private binding');
      });
    }
  }

  private async cleanupDraftFiles(draft: PreviewDraft): Promise<void> {
    await this.removeDraftPreviewBinding(draft);
    if (this.storage) await this.storage.removeManaged(draft.file.file_path).catch(() => undefined);
    else await unlink(draft.file.file_path).catch(() => undefined);
    await this.removePreviewKey(draft.previewKey);
  }

}

import { BadRequestException, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { readFile, unlink } from 'fs/promises';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { Resource } from '@entities/resource.entity';
import { ResourceStorageService, StoredResourceFile } from './resource-storage.service';
import { ResourceUploadDraft } from '@entities/resource-upload-draft.entity';
import { normalizeTiptapDocument } from '@common/utils/tiptap-content.util';
import { ResourceDuplicateService, ResourceDuplicateResult } from './resource-duplicate.service';

type RendererResult = {
  metadata?: Record<string, unknown>;
  previewKey?: string;
  parserVersion?: string;
};

const PREVIEW_KEY = /^resources\/(map|schematic)\/([a-f0-9]{2})\/([a-f0-9]{64})\/preview\.png$/;
const PREVIEWABLE_KINDS = new Set(['map', 'schematic']);
const MAX_RENDER_BYTES = 20 * 1024 * 1024;
const DRAFT_TTL_MS = 30 * 60 * 1000;
const MAX_DRAFTS_PER_USER = 5;

type RenderableFile = Pick<Resource, 'resource_kind' | 'file_path' | 'file_name' | 'file_size' | 'content_hash'>;
type RenderedPreview = Required<Pick<RendererResult, 'previewKey'>> & Pick<RendererResult, 'metadata' | 'parserVersion'>;
type RenderAttempt = { preview: RenderedPreview | null; errorCode: string };
type PreviewDraft = {
  id: string;
  userId: number;
  kind: string;
  file: StoredResourceFile;
  previewKey: string | null;
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
  ) {}

  supports(resource: Pick<Resource, 'resource_kind'>): boolean {
    return PREVIEWABLE_KINDS.has(resource.resource_kind || '');
  }

  /** Transform a schematic through the bundled official Mindustry reader/writer. */
  async transformSchematic(fileName: string, source: Buffer, operations: {
    rotation_quarters: number; mirror_x: boolean; delete_positions: Array<{ x: number; y: number }>;
  }): Promise<{ data: Buffer; sha256: string }> {
    if (!this.isConfigured()) throw new ServiceUnavailableException('Mindustry 蓝图编辑器暂不可用');
    const positions = operations?.delete_positions;
    if (!Number.isInteger(operations?.rotation_quarters) || operations.rotation_quarters < 0 || operations.rotation_quarters > 3
      || typeof operations.mirror_x !== 'boolean' || !Array.isArray(positions) || positions.length > 10_000
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
    if (!fileName.toLowerCase().endsWith('.msch') || source.length < 5 || source.length > MAX_RENDER_BYTES
      || source.subarray(0, 4).toString('ascii') !== 'msch') {
      throw new BadRequestException('蓝图文件无效或超过大小限制');
    }
    const sourceHash = createHash('sha256').update(source).digest('hex');
    try {
      const response = await fetch(`${this.rendererUrl}/v1/transform-schematic`, {
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
      await this.storeDraft(draft);
    } catch (error) {
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
    return { file: draft.file, previewKey: draft.previewKey, metadata: draft.metadata, parserVersion: draft.parserVersion };
  }

  async discardConsumedDraft(draft: ConsumedResourcePreviewDraft): Promise<void> {
    if (!draft.previewKey || !this.isValidPreviewKey(draft.previewKey)) return;
    await unlink(path.resolve(this.previewRoot, draft.previewKey)).catch(() => undefined);
  }

  async enqueue(resource: Pick<Resource, 'id' | 'resource_kind' | 'file_path' | 'file_name' | 'file_size' | 'content_hash'>): Promise<void> {
    if (!this.supports(resource)) return;
    if (!this.isConfigured()) {
      await this.resources.update(resource.id, { renderer_status: 'unavailable', renderer_error_code: 'RENDERER_UNAVAILABLE' });
      return;
    }
    if (!resource.file_path || !resource.file_name || !resource.content_hash) {
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
      'banned_blocks', 'banned_units', 'rules', 'core_count', 'cores', 'core_teams', 'tile_layers', 'tile_layers_truncated', 'blocks', 'block_count', 'block_types',
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
    if (typeof value === 'string') return value.slice(0, 20_000);
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
      if (!resource.file_path || !resource.file_name || !resource.content_hash) return { preview: null, errorCode: 'RENDER_SOURCE_MISSING' };
      const payload = await readFile(resource.file_path);
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

  private async cleanupDraftFiles(draft: PreviewDraft): Promise<void> {
    if (this.storage) await this.storage.removeManaged(draft.file.file_path).catch(() => undefined);
    else await unlink(draft.file.file_path).catch(() => undefined);
    await this.removePreviewKey(draft.previewKey);
  }

}

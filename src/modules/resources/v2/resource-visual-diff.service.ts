import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { SettingsService } from '../../settings/settings.service';
import { SiteConfigService } from '../../../config/site-profile';
import { RedisService } from '../../../database/redis.service';
import { ResourceFileProviderService } from '../resource-file-provider.service';
import { ResourceStorageService } from '../resource-storage.service';
import { ResourcePreviewService } from '../resource-preview.service';
import {
  ResourceDiffRendererClient,
  ResourceDiffRendererError,
} from './resource-diff-renderer.client';

export type VisualDiffKind = 'schematic' | 'map';
export type DiffViewer = { id?: number | null; role?: string | null } | null | undefined;
export type VisualDiffQuery = {
  from_version_public_id?: string;
  to_version_public_id?: string;
  offset_x?: number;
  offset_y?: number;
};
export type MapChunkQuery = VisualDiffQuery & { cx: number; cy: number };

export type VisualDiffPayload = {
  from_version_public_id: string | null;
  to_version_public_id: string | null;
  status: 'completed' | 'metadata_only' | 'computing' | 'unavailable' | 'disabled' | 'failed';
  parser_version: string | null;
  diff: Record<string, unknown> | null;
  retry_after_ms?: number;
  reason?: string | null;
};

export type VisualDiffResponse = { statusCode: 200 | 202; data: VisualDiffPayload };

type ResourceRow = {
  id: number; public_id: string; resource_kind: string; status: string; is_public: number;
  visibility: string | null; deleted_at: Date | null; merged_into_resource_id: number | null; user_id: number;
};
type VersionRow = {
  id: number; public_id: string; resource_id: number; version: string; status: string;
  recommended: number; revision: number; published_at: Date | null;
  file_path: string | null; file_name: string | null; file_size: number | null; content_hash: string | null;
  game_version_min: string | null; game_version_max: string | null;
};
type DiffRow = { diff_json: unknown; parser_version: string | null; status: string };

const VISUAL_DIFF_PARSER_VERSION = 'mdtbbs-visual-diff-1';
const MAX_DIFF_SOURCE_BYTES = 20 * 1024 * 1024;
const PUBLIC_STATUSES = new Set(['approved', 'published']);

/**
 * 蓝图/地图的可视化 Diff（schema_version 2）。
 *
 * 热路径：版本审核通过后由队列预计算上一推荐版 → 新版本，写入
 * `resource_version_diffs`。长尾路径：任意跨版本按需计算，使用 Redis
 * 分布式锁防止并发击穿；并发请求收到 202，而不是一起打爆 renderer。
 * Mod 内容由 renderer fail-closed 返回 `UNSUPPORTED_*`，此时降级为
 * `metadata_only` 并持久化，绝不把 500 暴露给读者。
 */
@Injectable()
export class ResourceVisualDiffService {
  private readonly logger = new Logger(ResourceVisualDiffService.name);

  constructor(
    @Optional() private readonly dataSource?: DataSource,
    @Optional() private readonly settings?: SettingsService,
    @Optional() private readonly siteConfig?: SiteConfigService,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly renderer?: ResourceDiffRendererClient,
    @Optional() private readonly fileProvider?: ResourceFileProviderService,
    @Optional() private readonly storage?: ResourceStorageService,
    @Optional() private readonly previews?: ResourcePreviewService,
  ) {}

  async isEnabled(): Promise<boolean> {
    const fallback = this.siteConfig?.isEnabled('resourceVisualDiff') ?? true;
    if (!this.settings) return fallback;
    return this.settings.getBoolean('resource_visual_diff_enabled', fallback);
  }

  /** 公开/成员可读的版本 Diff。返回 202 表示另一个请求正在计算。 */
  async getDiff(publicId: string, kind: VisualDiffKind, query: VisualDiffQuery, viewer?: DiffViewer): Promise<VisualDiffResponse> {
    if (!await this.isEnabled()) return { statusCode: 200, data: this.payload(null, null, 'disabled') };
    const executor = this.executor();
    const { resource, canManage } = await this.resolveResource(executor, publicId, kind, viewer);
    const versions = await this.versionRows(executor, resource.id, canManage);
    const to = this.pickToVersion(versions, query.to_version_public_id);
    if (!to) return { statusCode: 200, data: this.payload(null, null, 'unavailable', null, null, 'no_target_version') };
    const from = this.pickFromVersion(versions, to, query.from_version_public_id);
    if (!from || from.id === to.id) {
      return { statusCode: 200, data: this.payload(from?.public_id || null, to.public_id, 'unavailable', null, null, 'no_source_version') };
    }
    const offset = { x: this.boundedOffset(query.offset_x), y: this.boundedOffset(query.offset_y) };
    if (offset.x === 0 && offset.y === 0) {
      const stored = await this.readStoredDiff(executor, resource.id, from.id, to.id);
      if (stored) return { statusCode: 200, data: this.fromStored(stored, from, to) };
    }

    const lockKey = `forum:lock:res-diff:${from.id}:${to.id}`;
    const token = randomUUID();
    const acquired = offset.x === 0 && offset.y === 0 ? await this.acquireLock(lockKey, token) : true;
    if (!acquired) {
      const rechecked = await this.readStoredDiff(executor, resource.id, from.id, to.id);
      if (rechecked) return { statusCode: 200, data: this.fromStored(rechecked, from, to) };
      return {
        statusCode: 202,
        data: { ...this.payload(from.public_id, to.public_id, 'computing'), retry_after_ms: 1500, reason: 'computing' },
      };
    }
    try {
      const computed = await this.compute(resource, from, to, kind, offset);
      if (computed.persist && offset.x === 0 && offset.y === 0) {
        await this.persistDiff(executor, resource.id, from.id, to.id, computed.status, computed.diff);
      }
      return {
        statusCode: 200,
        data: {
          from_version_public_id: from.public_id,
          to_version_public_id: to.public_id,
          status: computed.status,
          parser_version: computed.status === 'unavailable' ? null : VISUAL_DIFF_PARSER_VERSION,
          diff: computed.diff,
          reason: computed.reason || null,
        },
      };
    } finally {
      if (offset.x === 0 && offset.y === 0) await this.releaseLock(lockKey, token);
    }
  }

  /** 128×128 分区 RLE 明细；只在完整 Diff 已存在时读取，结果缓存 1 小时。 */
  async getChunk(publicId: string, query: MapChunkQuery, viewer?: DiffViewer): Promise<VisualDiffResponse> {
    if (!await this.isEnabled()) {
      return { statusCode: 200, data: { ...this.payload(null, null, 'disabled'), chunk: null } as any };
    }
    const executor = this.executor();
    const { resource, canManage } = await this.resolveResource(executor, publicId, 'map', viewer);
    const versions = await this.versionRows(executor, resource.id, canManage);
    const to = this.pickToVersion(versions, query.to_version_public_id);
    if (!to) return { statusCode: 200, data: this.chunkPayload(null, null, query, 'unavailable') };
    const from = this.pickFromVersion(versions, to, query.from_version_public_id);
    if (!from || from.id === to.id) return { statusCode: 200, data: this.chunkPayload(from?.public_id || null, to.public_id, query, 'unavailable') };
    const stored = await this.readStoredDiff(executor, resource.id, from.id, to.id);
    if (!stored) {
      return { statusCode: 202, data: { ...this.chunkPayload(from.public_id, to.public_id, query, 'computing'), retry_after_ms: 1500 } };
    }
    if (stored.status === 'metadata_only' || (stored.diff_json as Record<string, any>)?.mode === 'metadata_only') {
      return { statusCode: 200, data: this.chunkPayload(from.public_id, to.public_id, query, 'metadata_only') };
    }
    const cacheKey = `forum:res-diff-chunk:${from.id}:${to.id}:${query.cx}:${query.cy}`;
    const cached = await this.redis?.get(cacheKey);
    if (cached) {
      try { return { statusCode: 200, data: { ...JSON.parse(cached), status: 'ready' } }; } catch { /* recompute */ }
    }
    const lockKey = `forum:lock:res-diff-chunk:${from.id}:${to.id}:${query.cx}:${query.cy}`;
    const token = randomUUID();
    if (!await this.acquireLock(lockKey, token)) {
      return { statusCode: 202, data: { ...this.chunkPayload(from.public_id, to.public_id, query, 'computing'), retry_after_ms: 1000 } };
    }
    try {
      const [fromBytes, toBytes] = await Promise.all([this.readVersionSource(from), this.readVersionSource(to)]);
      if (!fromBytes || !toBytes || !this.renderer?.configured) {
        return { statusCode: 200, data: this.chunkPayload(from.public_id, to.public_id, query, 'unavailable') };
      }
      const result = await this.renderer.mapChunk(fromBytes, toBytes, query.cx, query.cy);
      if (result.mode === 'metadata_only') {
        return { statusCode: 200, data: this.chunkPayload(from.public_id, to.public_id, query, 'metadata_only') };
      }
      const data = {
        from_version_public_id: from.public_id,
        to_version_public_id: to.public_id,
        cx: query.cx, cy: query.cy,
        chunk: result.chunk,
      };
      await this.redis?.set(cacheKey, JSON.stringify(data), 3600);
      return { statusCode: 200, data: { ...data, status: 'ready' } as any };
    } catch (error) {
      this.logger.warn(`Map diff chunk failed: ${(error as Error).message}`);
      return { statusCode: 200, data: this.chunkPayload(from.public_id, to.public_id, query, 'unavailable') };
    } finally {
      await this.releaseLock(lockKey, token);
    }
  }

  /** 读透明差异叠加层 PNG；只允许读取本次 Diff 记录里保存的受控 key。 */
  async readOverlay(publicId: string, query: VisualDiffQuery, viewer?: DiffViewer): Promise<Buffer> {
    if (!await this.isEnabled()) throw new NotFoundException('版本对比未启用');
    const executor = this.executor();
    const { resource, canManage } = await this.resolveResource(executor, publicId, 'map', viewer);
    const versions = await this.versionRows(executor, resource.id, canManage);
    const to = this.pickToVersion(versions, query.to_version_public_id);
    const from = to ? this.pickFromVersion(versions, to, query.from_version_public_id) : null;
    if (!from || !to) throw new NotFoundException('版本对比不存在');
    const stored = await this.readStoredDiff(executor, resource.id, from.id, to.id);
    const key = stored && typeof stored.diff_json === 'object' ? (stored.diff_json as Record<string, any>).diff_overlay_preview_key : null;
    if (typeof key !== 'string' || !/^resources\/map-diff\/[a-f0-9]{2}\/[a-f0-9]{64}\/overlay\.png$/.test(key) || !this.previews) {
      throw new NotFoundException('差异叠加层不存在');
    }
    const buffer = await this.previews.readDiffOverlay(key).catch(() => null);
    if (!buffer) throw new NotFoundException('差异叠加层不存在');
    return buffer;
  }

  /** 队列/懒计算共用：计算并持久化一个版本对，不执行权限判断。 */
  async computeAndStore(resourceId: number, fromVersionId: number, toVersionId: number): Promise<void> {
    if (!await this.isEnabled()) return;
    const executor = this.executor();
    const kindRows = await executor.query(
      'SELECT resource_kind FROM resources WHERE id=? AND deleted_at IS NULL LIMIT 1', [resourceId],
    ) as Array<{ resource_kind: string }>;
    const kind = kindRows[0]?.resource_kind;
    if (kind !== 'schematic' && kind !== 'map') return;
    const rows = await executor.query(
      'SELECT * FROM resource_versions WHERE resource_id=? AND id IN (?,?) AND public_id IS NOT NULL',
      [resourceId, fromVersionId, toVersionId],
    ) as VersionRow[];
    const from = rows.find((row) => Number(row.id) === Number(fromVersionId));
    const to = rows.find((row) => Number(row.id) === Number(toVersionId));
    if (!from || !to || from.status !== 'published' || to.status !== 'published') return;
    const lockKey = `forum:lock:res-diff:${from.id}:${to.id}`;
    const token = randomUUID();
    if (!await this.acquireLock(lockKey, token)) return;
    try {
      const existing = await this.readStoredDiff(executor, resourceId, from.id, to.id);
      if (existing) return;
      const resource = { id: resourceId } as ResourceRow;
      const computed = await this.compute(resource, from, to, kind, { x: 0, y: 0 });
      if (computed.persist) await this.persistDiff(executor, resourceId, from.id, to.id, computed.status, computed.diff);
    } finally {
      await this.releaseLock(lockKey, token);
    }
  }

  private async compute(
    resource: ResourceRow,
    from: VersionRow,
    to: VersionRow,
    kind: VisualDiffKind,
    offset: { x: number; y: number },
  ): Promise<{ status: 'completed' | 'metadata_only' | 'unavailable'; diff: Record<string, unknown> | null; persist: boolean; reason?: string }> {
    const [fromSource, toSource] = await Promise.all([this.readVersionSource(from), this.readVersionSource(to)]);
    if (!fromSource || !toSource) return { status: 'unavailable', diff: null, persist: false, reason: 'source_unavailable' };
    if (!this.renderer?.configured) return { status: 'unavailable', diff: null, persist: false, reason: 'renderer_unavailable' };
    try {
      const result = kind === 'schematic'
        ? await this.renderer.compareSchematic(fromSource, toSource, offset)
        : await this.renderer.compareMap(fromSource, toSource);
      if (result.mode === 'metadata_only') {
        return {
          status: 'metadata_only',
          diff: await this.buildMetadataOnlyDiff(from, to, result.fallbackReason || 'MODDED_CONTENT_NOT_SUPPORTED_BY_VANILLA_RENDERER'),
          persist: true,
        };
      }
      const diff = { ...result.diff } as Record<string, unknown>;
      if (kind === 'schematic' && offset.x === 0 && offset.y === 0) diff.offset = { x: 0, y: 0 };
      if (kind === 'map') {
        if (result.diffOverlayKey) diff.diff_overlay_preview_key = result.diffOverlayKey;
        await this.attachWaveCurve(diff, from.id, to.id);
      }
      diff.parser_version = VISUAL_DIFF_PARSER_VERSION;
      return { status: 'completed', diff, persist: true };
    } catch (error) {
      if (error instanceof ResourceDiffRendererError) {
        if (error.modded) {
          return {
            status: 'metadata_only',
            diff: await this.buildMetadataOnlyDiff(from, to, 'MODDED_CONTENT_NOT_SUPPORTED_BY_VANILLA_RENDERER'),
            persist: true,
          };
        }
        this.logger.warn(`Visual diff renderer unavailable: ${error.code}`);
        return { status: 'unavailable', diff: null, persist: false, reason: error.code.toLowerCase() };
      }
      throw error;
    }
  }

  private async attachWaveCurve(diff: Record<string, unknown>, fromId: number, toId: number): Promise<void> {
    const waves = diff.waves_diff;
    if (!waves || typeof waves !== 'object' || Array.isArray(waves)) return;
    const rows = await this.executor().query(
      `SELECT resource_version_id,wave_start,wave_end,estimated_health,strength,boss_count
       FROM map_wave_summaries WHERE resource_version_id IN (?,?) ORDER BY wave_start ASC,id ASC`,
      [fromId, toId],
    ) as Array<Record<string, any>>;
    const curve = (versionId: number) => rows.filter((row) => Number(row.resource_version_id) === versionId).map((row) => ({
      wave_start: Number(row.wave_start), wave_end: Number(row.wave_end),
      estimated_health: row.estimated_health == null ? null : Number(row.estimated_health),
      strength: row.strength == null ? null : Number(row.strength),
      boss_count: Number(row.boss_count) || 0,
    }));
    (waves as Record<string, unknown>).curve = { before: curve(fromId), after: curve(toId) };
  }

  /** Renderer fail-closed 时的降级 Diff：只做元数据、体积、哈希与依赖清单比较。 */
  private async buildMetadataOnlyDiff(from: VersionRow, to: VersionRow, fallbackReason: string): Promise<Record<string, unknown>> {
    const dependencies = await this.executor().query(
      `SELECT resource_version_id,external_identifier FROM resource_dependencies
       WHERE resource_version_id IN (?,?) AND external_identifier IS NOT NULL
       ORDER BY sort_order ASC,id ASC`,
      [from.id, to.id],
    ) as Array<{ resource_version_id: number; external_identifier: string }>;
    const listFor = (id: number) => [...new Set(dependencies.filter((row) => Number(row.resource_version_id) === id)
      .map((row) => String(row.external_identifier)))].sort((left, right) => left.localeCompare(right));
    const before = listFor(from.id);
    const after = listFor(to.id);
    return {
      schema_version: 2,
      mode: 'metadata_only',
      kind: from.file_name?.toLowerCase().endsWith('.msch') ? 'schematic' : 'map',
      fallback_reason: fallbackReason,
      file_delta: {
        size_from: from.file_size == null ? null : Number(from.file_size),
        size_to: to.file_size == null ? null : Number(to.file_size),
        sha256_changed: Boolean(from.content_hash && to.content_hash && from.content_hash !== to.content_hash),
      },
      metadata_delta: {
        version_from: from.version || null,
        version_to: to.version || null,
        game_version_bounds_changed: from.game_version_min !== to.game_version_min || from.game_version_max !== to.game_version_max,
      },
      dependencies_delta: {
        added: after.filter((item) => !before.includes(item)),
        removed: before.filter((item) => !after.includes(item)),
      },
      estimated: true,
      parser_version: VISUAL_DIFF_PARSER_VERSION,
    };
  }

  private async readVersionSource(version: VersionRow): Promise<{ data: Buffer; sha256: string } | null> {
    try {
      const files = await this.executor().query(
        `SELECT * FROM resource_files WHERE resource_version_id=? AND public_id IS NOT NULL
         ORDER BY FIELD(role,'primary','documentation','supplementary'),sort_order ASC,id ASC`,
        [version.id],
      ) as Array<Record<string, any>>;
      const file = files[0];
      let data: Buffer | null = null;
      if (file && this.fileProvider) {
        data = await this.fileProvider.getReadableContent(file as any, MAX_DIFF_SOURCE_BYTES).catch(() => null);
      }
      if (!data && version.file_path && this.storage) {
        data = await this.storage.readManagedFile(version.file_path, MAX_DIFF_SOURCE_BYTES).catch(() => null);
      }
      if (!data || !data.length || data.length > MAX_DIFF_SOURCE_BYTES) return null;
      const sha256 = String(version.content_hash || file?.content_hash || '').toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
      return { data, sha256 };
    } catch (error) {
      this.logger.warn(`Could not read diff source for version ${version.id}: ${(error as Error).message}`);
      return null;
    }
  }

  private async resolveResource(executor: any, publicId: string, kind: VisualDiffKind, viewer?: DiffViewer): Promise<{ resource: ResourceRow; canManage: boolean }> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(publicId)) {
      throw new NotFoundException('资源不存在或不可见');
    }
    const rows = await executor.query(
      `SELECT id,public_id,resource_kind,status,is_public,visibility,deleted_at,merged_into_resource_id,user_id
       FROM resources WHERE public_id=? LIMIT 1`, [publicId],
    ) as ResourceRow[];
    const resource = rows[0];
    if (!resource || resource.deleted_at || resource.merged_into_resource_id || resource.resource_kind !== kind) {
      throw new NotFoundException('资源不存在或不可见');
    }
    const userId = Number(viewer?.id);
    const role = String(viewer?.role || '').toLowerCase();
    const isPublic = PUBLIC_STATUSES.has(resource.status) && Number(resource.is_public) === 1 && resource.visibility !== 'private';
    let canManage = Boolean(Number.isSafeInteger(userId) && userId === Number(resource.user_id)) || ['admin', 'moderator'].includes(role);
    if (!canManage && Number.isSafeInteger(userId) && userId > 0) {
      const memberships = await executor.query(
        "SELECT role FROM resource_members WHERE resource_id=? AND user_id=? AND status='active' LIMIT 1",
        [resource.id, userId],
      ) as Array<{ role: string }>;
      canManage = ['owner', 'maintainer', 'publisher'].includes(String(memberships[0]?.role || ''));
    }
    if (!isPublic && !canManage) throw new NotFoundException('资源不存在或不可见');
    return { resource, canManage };
  }

  private async versionRows(executor: any, resourceId: number, canManage: boolean): Promise<VersionRow[]> {
    const rows = await executor.query(
      `SELECT * FROM resource_versions WHERE resource_id=? AND public_id IS NOT NULL
       ORDER BY recommended DESC, COALESCE(published_at,created_at) DESC, revision DESC, id DESC`,
      [resourceId],
    ) as VersionRow[];
    return canManage ? rows : rows.filter((row) => row.status === 'published');
  }

  private pickToVersion(versions: VersionRow[], publicId?: string): VersionRow | null {
    if (publicId) return versions.find((row) => row.public_id === publicId) || null;
    return versions[0] || null;
  }

  private pickFromVersion(versions: VersionRow[], to: VersionRow, publicId?: string): VersionRow | null {
    if (publicId) return versions.find((row) => row.public_id === publicId) || null;
    const index = versions.findIndex((row) => row.id === to.id);
    return index >= 0 ? versions[index + 1] || null : null;
  }

  private async readStoredDiff(executor: any, resourceId: number, fromId: number, toId: number): Promise<DiffRow | null> {
    const rows = await executor.query(
      'SELECT diff_json,parser_version,status FROM resource_version_diffs WHERE resource_id=? AND from_version_id=? AND to_version_id=? LIMIT 1',
      [resourceId, fromId, toId],
    ) as DiffRow[];
    const row = rows[0];
    if (!row) return null;
    let parsed: Record<string, unknown> | null = null;
    if (typeof row.diff_json === 'string') {
      try { parsed = JSON.parse(row.diff_json); } catch { parsed = null; }
    } else if (row.diff_json && typeof row.diff_json === 'object') parsed = row.diff_json as Record<string, unknown>;
    if (!parsed || parsed.schema_version !== 2) return null;
    return { ...row, diff_json: parsed };
  }

  private async persistDiff(executor: any, resourceId: number, fromId: number, toId: number, status: string, diff: Record<string, unknown> | null): Promise<void> {
    if (!diff) return;
    await executor.query(
      `INSERT INTO resource_version_diffs (resource_id,from_version_id,to_version_id,diff_json,parser_version,status,created_at)
       VALUES (?,?,?,?,?,?,NOW(6))
       ON DUPLICATE KEY UPDATE diff_json=VALUES(diff_json),parser_version=VALUES(parser_version),status=VALUES(status)`,
      [resourceId, fromId, toId, JSON.stringify(diff), VISUAL_DIFF_PARSER_VERSION, status === 'metadata_only' ? 'metadata_only' : 'completed'],
    );
  }

  private fromStored(row: DiffRow, from: VersionRow, to: VersionRow): VisualDiffPayload {
    const diff = row.diff_json as Record<string, unknown>;
    const metadataOnly = diff.mode === 'metadata_only' || row.status === 'metadata_only';
    return {
      from_version_public_id: from.public_id,
      to_version_public_id: to.public_id,
      status: metadataOnly ? 'metadata_only' : 'completed',
      parser_version: row.parser_version || VISUAL_DIFF_PARSER_VERSION,
      diff,
      reason: null,
    };
  }

  private payload(from: string | null, to: string | null, status: VisualDiffPayload['status'], parserVersion: string | null = null, diff: Record<string, unknown> | null = null, reason?: string): VisualDiffPayload {
    return {
      from_version_public_id: from, to_version_public_id: to, status,
      parser_version: parserVersion, diff, ...(reason ? { reason } : {}),
    };
  }

  private chunkPayload(from: string | null, to: string | null, query: MapChunkQuery, status: string): any {
    return {
      from_version_public_id: from, to_version_public_id: to,
      cx: query.cx, cy: query.cy, status, chunk: null,
    };
  }

  private boundedOffset(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? Math.max(-127, Math.min(127, parsed)) : 0;
  }

  private async acquireLock(key: string, token: string): Promise<boolean> {
    if (!this.redis) return true;
    try { return await this.redis.setIfNotExists(key, token, 30); } catch { return true; }
  }

  private async releaseLock(key: string, token: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.getAndDeleteIfMatches(key, token).catch(() => undefined);
  }

  private executor(): any {
    if (!this.dataSource) throw new Error('ResourceVisualDiffService requires a DataSource');
    return this.dataSource;
  }
}

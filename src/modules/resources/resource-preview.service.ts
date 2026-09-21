import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readFile, unlink } from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Resource } from '@entities/resource.entity';
import { ResourceStorageService, StoredResourceFile } from './resource-storage.service';

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
  kind: 'map' | 'schematic';
  file: StoredResourceFile;
  previewKey: string;
  metadata: Record<string, unknown> | null;
  parserVersion: string | null;
  expiresAt: number;
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

  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    private readonly storage?: ResourceStorageService,
  ) {}

  supports(resource: Pick<Resource, 'resource_kind'>): boolean {
    return PREVIEWABLE_KINDS.has(resource.resource_kind || '');
  }

  isConfigured(): boolean {
    return Boolean(process.env.RESOURCE_RENDERER_URL);
  }

  /**
   * Render an authenticated, not-yet-submitted map/blueprint. Its file remains
   * in the ordinary resource quarantine and is accessible only through a
   * short-lived, user-bound draft identifier.
   */
  async createDraft(userId: number, kind: 'map' | 'schematic', file: StoredResourceFile): Promise<{
    id: string; preview_url: string; metadata: Record<string, unknown> | null; parser_version: string | null; expires_at: string;
  }> {
    await this.pruneExpiredDrafts();
    if (!this.supports({ resource_kind: kind })) throw new BadRequestException('该资源类型不支持预览');
    if (!this.isConfigured()) throw new BadRequestException('预览服务暂不可用，请稍后重试');
    if (file.file_size <= 0 || file.file_size > MAX_RENDER_BYTES) throw new BadRequestException('文件大小不支持生成预览');
    await this.makeRoomForDraft(userId);

    const rendered = await this.render({ resource_kind: kind, ...file });
    if (!rendered.preview) throw new BadRequestException('文件无法解析为有效的 Mindustry 地图或蓝图');

    const id = randomUUID();
    const expiresAt = Date.now() + DRAFT_TTL_MS;
    this.drafts.set(id, {
      id, userId, kind, file, previewKey: rendered.preview.previewKey,
      metadata: this.safeMetadata(rendered.preview.metadata),
      parserVersion: typeof rendered.preview.parserVersion === 'string' ? rendered.preview.parserVersion.slice(0, 100) : null,
      expiresAt,
    });
    return {
      id,
      preview_url: `/api/resources/drafts/${id}/preview`,
      metadata: this.safeMetadata(rendered.preview.metadata),
      parser_version: typeof rendered.preview.parserVersion === 'string' ? rendered.preview.parserVersion.slice(0, 100) : null,
      expires_at: new Date(expiresAt).toISOString(),
    };
  }

  async readDraftPreview(userId: number, id: string): Promise<Buffer> {
    const draft = await this.requireDraft(userId, id);
    try {
      return await readFile(path.resolve(this.previewRoot, draft.previewKey));
    } catch {
      throw new NotFoundException('预览已失效，请重新生成');
    }
  }

  async takeDraft(userId: number, id: string, kind: string): Promise<StoredResourceFile> {
    const draft = await this.requireDraft(userId, id);
    if (draft.kind !== kind) throw new BadRequestException('预览草稿与资源类型不匹配');
    this.drafts.delete(id);
    return draft.file;
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

  async readPreview(resource: Pick<Resource, 'renderer_status' | 'renderer_preview_key'>): Promise<Buffer | null> {
    if (resource.renderer_status !== 'ready' || !this.isValidPreviewKey(resource.renderer_preview_key)) return null;
    try {
      return await readFile(path.resolve(this.previewRoot, resource.renderer_preview_key));
    } catch {
      return null;
    }
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
    const allowed = ['name', 'author', 'description', 'width', 'height', 'spawns', 'version', 'build', 'blocks', 'labels'];
    return Object.fromEntries(Object.entries(value).filter(([key, item]) => allowed.includes(key) && (
      typeof item === 'string' || typeof item === 'number' || Array.isArray(item)
    )));
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
    const draft = this.drafts.get(id);
    if (!draft || draft.userId !== userId) throw new NotFoundException('预览草稿不存在或已过期');
    return draft;
  }

  private async pruneExpiredDrafts(): Promise<void> {
    const now = Date.now();
    for (const [id, draft] of this.drafts) {
      if (draft.expiresAt > now) continue;
      await this.deleteDraft(id, draft);
    }
  }

  /** Keep previews disposable: replacing a file should never strand a user at a draft quota. */
  private async makeRoomForDraft(userId: number): Promise<void> {
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
    if (this.storage) await this.storage.removeManaged(draft.file.file_path).catch(() => undefined);
    else await unlink(draft.file.file_path).catch(() => undefined);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readFile } from 'fs/promises';
import * as path from 'path';
import { Resource } from '@entities/resource.entity';

type RendererResult = {
  metadata?: Record<string, unknown>;
  previewKey?: string;
  parserVersion?: string;
};

const PREVIEW_KEY = /^resources\/(map|schematic)\/([a-f0-9]{2})\/([a-f0-9]{64})\/preview\.png$/;
const PREVIEWABLE_KINDS = new Set(['map', 'schematic']);
const MAX_RENDER_BYTES = 20 * 1024 * 1024;

/**
 * Forum-side client for the bundled Mindustry renderer. The renderer is a
 * loopback-only, restricted Java process; this service is its only public
 * boundary and validates every renderer-supplied storage key before reading it.
 */
@Injectable()
export class ResourcePreviewService {
  private readonly logger = new Logger(ResourcePreviewService.name);

  constructor(@InjectRepository(Resource) private readonly resources: Repository<Resource>) {}

  supports(resource: Pick<Resource, 'resource_kind'>): boolean {
    return PREVIEWABLE_KINDS.has(resource.resource_kind || '');
  }

  isConfigured(): boolean {
    return Boolean(process.env.RESOURCE_RENDERER_URL);
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
    try {
      const payload = await readFile(resource.file_path);
      if (payload.length === 0 || payload.length > MAX_RENDER_BYTES) {
        await this.fail(resource.id, 'FILE_TOO_LARGE_FOR_PREVIEW');
        return;
      }
      const response = await fetch(`${this.rendererUrl}/v1/analyze`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.RESOURCE_RENDERER_TOKEN ? { authorization: `Bearer ${process.env.RESOURCE_RENDERER_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          filename: resource.file_name,
          resourceType: resource.resource_kind,
          sha256: resource.content_hash,
          dataBase64: payload.toString('base64'),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { errorCode?: unknown };
        await this.fail(resource.id, this.safeErrorCode(body.errorCode));
        return;
      }
      const result = await response.json() as RendererResult;
      if (!this.isValidPreviewKey(result.previewKey, resource.resource_kind, resource.content_hash)) {
        await this.fail(resource.id, 'INVALID_RENDER_RESULT');
        return;
      }
      await this.resources.update(resource.id, {
        renderer_status: 'ready',
        renderer_error_code: null,
        renderer_preview_key: result.previewKey,
        renderer_parser_version: typeof result.parserVersion === 'string' ? result.parserVersion.slice(0, 100) : null,
        renderer_metadata_json: this.safeMetadata(result.metadata) as any,
      });
    } catch (error) {
      this.logger.warn(`Resource preview failed for ${resource.id}: ${(error as Error).message}`);
      await this.fail(resource.id, 'RENDER_FAILED');
    }
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
}

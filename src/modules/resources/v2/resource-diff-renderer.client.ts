import { Injectable, Logger } from '@nestjs/common';

export type RendererDiffInput = { data: Buffer; sha256: string };
export type RendererDiffEnvelope = {
  schemaVersion: 2;
  mode: 'full' | 'metadata_only';
  fallbackReason: string | null;
  unknownContent: string[];
  diff: Record<string, unknown> | null;
  diffOverlayKey: string | null;
};
export type RendererChunkEnvelope = {
  schemaVersion: 2;
  mode: 'full' | 'metadata_only';
  fallbackReason: string | null;
  chunk: Record<string, unknown> | null;
};

export class ResourceDiffRendererError extends Error {
  constructor(public readonly code: string, public readonly modded: boolean, message: string) {
    super(message);
    this.name = 'ResourceDiffRendererError';
  }
}

const MAX_RESPONSE_CHARS = 8 * 1024 * 1024;

/** Mindustry renderer 的视觉 Diff 客户端。renderer 是本机回环 worker，仍校验响应结构。 */
@Injectable()
export class ResourceDiffRendererClient {
  private readonly logger = new Logger(ResourceDiffRendererClient.name);

  get configured(): boolean { return Boolean(process.env.RESOURCE_RENDERER_URL); }

  async compareSchematic(from: RendererDiffInput, to: RendererDiffInput, offset: { x: number; y: number } = { x: 0, y: 0 }): Promise<RendererDiffEnvelope> {
    return this.post('/v2/schematic-diff', {
      fromBase64: from.data.toString('base64'), fromSha256: from.sha256,
      toBase64: to.data.toString('base64'), toSha256: to.sha256,
      offset_x: offset.x, offset_y: offset.y,
    }, this.validateEnvelope);
  }

  async compareMap(from: RendererDiffInput, to: RendererDiffInput): Promise<RendererDiffEnvelope> {
    return this.post('/v2/map-diff', {
      fromBase64: from.data.toString('base64'), fromSha256: from.sha256,
      toBase64: to.data.toString('base64'), toSha256: to.sha256,
    }, this.validateEnvelope);
  }

  async mapChunk(from: RendererDiffInput, to: RendererDiffInput, cx: number, cy: number): Promise<RendererChunkEnvelope> {
    return this.post('/v2/map-diff-chunk', {
      fromBase64: from.data.toString('base64'), fromSha256: from.sha256,
      toBase64: to.data.toString('base64'), toSha256: to.sha256, cx, cy,
    }, this.validateChunk);
  }

  private async post<T>(path: string, body: Record<string, unknown>, validate: (value: unknown) => T): Promise<T> {
    if (!this.configured) throw new ResourceDiffRendererError('RENDERER_NOT_CONFIGURED', false, 'Mindustry renderer is not configured');
    try {
      const response = await fetch(`${process.env.RESOURCE_RENDERER_URL}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.RESOURCE_RENDERER_TOKEN ? { authorization: `Bearer ${process.env.RESOURCE_RENDERER_TOKEN}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      const text = await response.text();
      if (text.length > MAX_RESPONSE_CHARS) throw new ResourceDiffRendererError('RENDERER_RESPONSE_TOO_LARGE', false, 'Renderer diff response exceeded the limit');
      let parsed: unknown = null;
      try { parsed = JSON.parse(text); } catch { /* handled below */ }
      if (!response.ok) {
        const errorCode = parsed && typeof parsed === 'object' ? String((parsed as Record<string, unknown>).errorCode || '') : '';
        const modded = ['UNSUPPORTED_MOD_CONTENT', 'UNSUPPORTED_SCHEMATIC_CONTENT', 'UNSUPPORTED_MAP_CONTENT'].includes(errorCode);
        throw new ResourceDiffRendererError(errorCode || `RENDERER_HTTP_${response.status}`, modded, `Renderer diff failed with ${errorCode || response.status}`);
      }
      return validate(parsed);
    } catch (error) {
      if (error instanceof ResourceDiffRendererError) throw error;
      this.logger.warn(`Renderer diff request failed: ${(error as Error).message}`);
      throw new ResourceDiffRendererError('RENDERER_UNAVAILABLE', false, 'Mindustry renderer is unavailable');
    }
  }

  private validateEnvelope(value: unknown): RendererDiffEnvelope {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ResourceDiffRendererError('INVALID_RENDERER_RESULT', false, 'Renderer diff result was invalid');
    const record = value as Record<string, unknown>;
    if (record.schemaVersion !== 2 || !['full', 'metadata_only'].includes(String(record.mode))) {
      throw new ResourceDiffRendererError('INVALID_RENDERER_RESULT', false, 'Renderer diff result was invalid');
    }
    const mode = record.mode as 'full' | 'metadata_only';
    if (mode === 'full' && (!record.diff || typeof record.diff !== 'object' || Array.isArray(record.diff))) {
      throw new ResourceDiffRendererError('INVALID_RENDERER_RESULT', false, 'Renderer diff result was invalid');
    }
    if (mode === 'full') {
      const diff = record.diff as Record<string, unknown>;
      if (diff.schema_version !== 2) throw new ResourceDiffRendererError('INVALID_RENDERER_RESULT', false, 'Renderer diff schema was invalid');
    }
    const overlay = typeof record.diffOverlayKey === 'string' && /^resources\/map-diff\/[a-f0-9]{2}\/[a-f0-9]{64}\/overlay\.png$/.test(record.diffOverlayKey)
      ? record.diffOverlayKey : null;
    return {
      schemaVersion: 2,
      mode,
      fallbackReason: typeof record.fallbackReason === 'string' ? record.fallbackReason.slice(0, 120) : null,
      unknownContent: Array.isArray(record.unknownContent) ? record.unknownContent.map(String).slice(0, 100) : [],
      diff: mode === 'full' ? record.diff as Record<string, unknown> : null,
      diffOverlayKey: overlay,
    };
  }

  private validateChunk(value: unknown): RendererChunkEnvelope {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ResourceDiffRendererError('INVALID_RENDERER_RESULT', false, 'Renderer chunk result was invalid');
    const record = value as Record<string, unknown>;
    if (record.schemaVersion !== 2 || !['full', 'metadata_only'].includes(String(record.mode))) {
      throw new ResourceDiffRendererError('INVALID_RENDERER_RESULT', false, 'Renderer chunk result was invalid');
    }
    const mode = record.mode as 'full' | 'metadata_only';
    if (mode === 'full' && (!record.chunk || typeof record.chunk !== 'object' || Array.isArray(record.chunk))) {
      throw new ResourceDiffRendererError('INVALID_RENDERER_RESULT', false, 'Renderer chunk result was invalid');
    }
    return {
      schemaVersion: 2,
      mode,
      fallbackReason: typeof record.fallbackReason === 'string' ? record.fallbackReason.slice(0, 120) : null,
      chunk: mode === 'full' ? record.chunk as Record<string, unknown> : null,
    };
  }
}

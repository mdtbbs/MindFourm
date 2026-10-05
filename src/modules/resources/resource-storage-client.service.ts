import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { HttpException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

export interface ResObject {
  id: string;
  public_id: string;
  sha256: string;
  size_bytes: number;
  mime_type: string;
  original_filename: string;
  state: string;
  created_at: string;
  verified_at: string | null;
}

export type ResUploadSession =
  | { deduplicated: true; object: Pick<ResObject, 'id' | 'public_id' | 'sha256' | 'size_bytes'> }
  | { deduplicated: false; upload: { session_id: string; url: string; token: string; expires_at: string } };

export interface ResBinding {
  id: string;
  object_id: string;
  namespace: string;
  owner_type: string;
  owner_id: string;
  visibility: 'public' | 'private';
  created_at: string;
}

export interface ResBindingInput {
  namespace: string;
  owner_type: string;
  owner_id: string;
  visibility: 'public' | 'private';
}

/** Safe operational error: never embeds a response body, URL token, or service key. */
export class ResourceStorageClientError extends HttpException {
  constructor(public readonly code: 'unavailable' | 'unauthorized' | 'not_found' | 'rejected' | 'timeout', public readonly upstreamStatus?: number) {
    const unavailable = ['unavailable', 'unauthorized', 'timeout'].includes(code);
    super({ code: unavailable ? 'RESOURCE_STORAGE_UNAVAILABLE' : code === 'not_found' ? 'RESOURCE_STORAGE_OBJECT_NOT_FOUND' : 'RESOURCE_STORAGE_REJECTED',
      message: unavailable ? '资源存储服务暂不可用，请稍后重试' : code === 'not_found' ? '资源存储对象不存在' : '资源存储对象校验失败', retryable: unavailable },
    unavailable ? 503 : code === 'not_found' ? 404 : 422);
    this.name = 'ResourceStorageClientError';
  }
}

@Injectable()
export class ResourceStorageClientService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly enabled: boolean;
  private readonly requestTimeoutMs: number;
  private readonly uploadTimeoutMs: number;

  constructor(configService: ConfigService, @Optional() private readonly dataSource?: DataSource) {
    this.baseUrl = (configService.get<string>('res.baseUrl') || '').replace(/\/+$/, '');
    this.apiKey = configService.get<string>('res.apiKey') || '';
    this.enabled = configService.get<boolean>('res.enabled') !== false;
    this.requestTimeoutMs = configService.get<number>('res.requestTimeoutMs') || 10_000;
    this.uploadTimeoutMs = configService.get<number>('res.uploadTimeoutMs') || 120_000;
  }

  get isAvailable(): boolean {
    return this.enabled && Boolean(this.baseUrl && this.apiKey);
  }

  private assertAvailable(): void {
    if (!this.isAvailable) throw new ResourceStorageClientError('unavailable');
  }

  private async request(path: string, init: RequestInit = {}, timeoutMs = this.requestTimeoutMs): Promise<Response> {
    this.assertAvailable();
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.apiKey}`, ...init.headers },
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw new ResourceStorageClientError('timeout');
      throw new ResourceStorageClientError('unavailable');
    }
    if (response.ok) return response;
    // Drain without exposing upstream payload, which may contain sensitive details.
    await response.body?.cancel().catch(() => undefined);
    const code = response.status === 401 || response.status === 403 ? 'unauthorized'
      : response.status === 404 ? 'not_found'
        : response.status >= 500 ? 'unavailable' : 'rejected';
    throw new ResourceStorageClientError(code, response.status);
  }

  private async readJson<T>(response: Response): Promise<T> {
    try { return await response.json() as T; }
    catch { throw new ResourceStorageClientError('rejected'); }
  }

  private post(path: string, body: unknown): Promise<Response> {
    return this.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  private async enforceResourceFileVisibility(input: ResBindingInput): Promise<ResBindingInput> {
    if (input.visibility !== 'public' || input.owner_type !== 'resource_file' || !this.dataSource) return input;
    const rows = await this.dataSource.query(
      `SELECT r.status,r.is_public,r.visibility,r.deleted_at
       FROM resource_files f
       INNER JOIN resource_versions v ON v.id=f.resource_version_id
       INNER JOIN resources r ON r.id=v.resource_id
       WHERE f.public_id=? LIMIT 1`,
      [input.owner_id],
    ) as Array<{ status: string; is_public: number; visibility: string | null; deleted_at: Date | null }>;
    const resource = rows[0];
    const canBePublic = resource
      && !resource.deleted_at
      && ['approved', 'published'].includes(resource.status)
      && Number(resource.is_public) === 1
      && resource.visibility !== 'private';
    return canBePublic ? input : { ...input, visibility: 'private' };
  }

  async createUploadSession(input: { sha256?: string; size_bytes: number; mime_type: string; original_filename: string; purpose: string }): Promise<ResUploadSession> {
    const response = await this.post('/api/v1/uploads', input);
    const result = await this.readJson<ResUploadSession>(response);
    if (result.deduplicated === true && result.object?.public_id && /^[a-f0-9]{64}$/i.test(result.object.sha256)) return result;
    if (result.deduplicated === false && result.upload?.token && result.upload.session_id) {
      let url: URL;
      try { url = new URL(result.upload.url); } catch { throw new ResourceStorageClientError('rejected'); }
      if (url.origin === new URL(this.baseUrl).origin && url.pathname === `/upload/${encodeURIComponent(result.upload.session_id)}`
        && Number.isFinite(Date.parse(result.upload.expires_at))) return result;
    }
    throw new ResourceStorageClientError('rejected');
  }

  async getObject(id: string): Promise<ResObject> {
    const response = await this.request(`/api/v1/objects/${encodeURIComponent(id)}`);
    const result = await this.readJson<{ object: ResObject }>(response);
    if (!result.object?.public_id || !/^[a-f0-9]{64}$/i.test(result.object.sha256)
      || !Number.isSafeInteger(result.object.size_bytes) || result.object.size_bytes < 0
      || typeof result.object.mime_type !== 'string' || typeof result.object.original_filename !== 'string') throw new ResourceStorageClientError('rejected');
    return result.object;
  }

  async getObjectContent(id: string, options: { maxBytes?: number; signal?: AbortSignal } = {}): Promise<Buffer> {
    const response = await this.request(`/api/v1/objects/${encodeURIComponent(id)}/content`, { signal: options.signal });
    const limit = options.maxBytes ?? 64 * 1024 * 1024;
    const reader = response.body?.getReader();
    if (!reader) throw new ResourceStorageClientError('unavailable');
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new ResourceStorageClientError('rejected');
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks, size);
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  async createBinding(id: string, input: ResBindingInput): Promise<ResBinding> {
    const safeInput = await this.enforceResourceFileVisibility(input);
    const response = await this.post(`/api/v1/objects/${encodeURIComponent(id)}/bindings`, safeInput);
    const result = await this.readJson<{ binding: ResBinding }>(response);
    if (!result.binding?.id || result.binding.owner_id !== safeInput.owner_id || result.binding.visibility !== safeInput.visibility) throw new ResourceStorageClientError('rejected');
    return result.binding;
  }

  async deleteBinding(id: string, bindingId: string): Promise<void> {
    await this.request(`/api/v1/objects/${encodeURIComponent(id)}/bindings/${encodeURIComponent(bindingId)}`, { method: 'DELETE' });
  }

  async createPrivateDownloadUrl(id: string, input: { filename?: string; expires_in?: number } = {}): Promise<{ url: string; expires_at: string }> {
    const response = await this.post(`/api/v1/objects/${encodeURIComponent(id)}/signed-url`, input);
    const result = await this.readJson<{ url: string; expires_at: string }>(response);
    let url: URL;
    try { url = new URL(result.url); } catch { throw new ResourceStorageClientError('rejected'); }
    if (url.origin !== new URL(this.baseUrl).origin || !url.pathname.startsWith('/private/') || !Number.isFinite(Date.parse(result.expires_at))) throw new ResourceStorageClientError('rejected');
    return result;
  }

  buildPublicDownloadUrl(publicId: string, filename: string): string {
    if (!this.baseUrl) throw new ResourceStorageClientError('unavailable');
    return `${this.baseUrl}/o/${encodeURIComponent(publicId)}/${encodeURIComponent(filename)}`;
  }

  async uploadServerGeneratedObject(input: {
    body: Buffer | Readable;
    sizeBytes: number;
    sha256?: string;
    mimeType: string;
    filename: string;
    purpose: string;
  }): Promise<ResObject> {
    try {
    this.assertAvailable();
    const sha256 = input.sha256 || (Buffer.isBuffer(input.body) ? createHash('sha256').update(input.body).digest('hex') : undefined);
    const session = await this.createUploadSession({
      sha256,
      size_bytes: input.sizeBytes,
      mime_type: input.mimeType,
      original_filename: input.filename,
      purpose: input.purpose,
    });
    if (session.deduplicated) {
      const object = await this.getObject(session.object.public_id);
      if (object.state !== 'verified' || object.size_bytes !== input.sizeBytes || (sha256 && object.sha256 !== sha256)) {
        throw new ResourceStorageClientError('rejected');
      }
      return object;
    }
    const uploadUrl = new URL(session.upload.url);
    // The upload token must only go to the configured ResourceStorage origin.
    if (uploadUrl.origin !== new URL(this.baseUrl).origin || !uploadUrl.pathname.startsWith('/upload/')) {
      throw new ResourceStorageClientError('rejected');
    }
    const body = Buffer.isBuffer(input.body) ? new Uint8Array(input.body) : Readable.toWeb(input.body) as ReadableStream;
    let response: Response;
    try {
      response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.upload.token}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(input.sizeBytes),
        },
        body,
        duplex: 'half',
        signal: AbortSignal.timeout(this.uploadTimeoutMs),
      } as RequestInit & { duplex: 'half' });
    } catch {
      throw new ResourceStorageClientError('unavailable');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new ResourceStorageClientError(response.status >= 500 ? 'unavailable' : 'rejected', response.status);
    }
    const result = await this.readJson<{ object: { public_id: string } }>(response);
    if (!result.object?.public_id) throw new ResourceStorageClientError('rejected');
    const object = await this.getObject(result.object.public_id);
    if (object.state !== 'verified' || object.size_bytes !== input.sizeBytes || (sha256 && object.sha256 !== sha256)) {
      throw new ResourceStorageClientError('rejected');
    }
    return object;
    } finally {
      if (!Buffer.isBuffer(input.body)) input.body.destroy();
    }
  }
}

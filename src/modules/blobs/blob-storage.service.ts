import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';

export type BlobObjectInfo = { exists: boolean; size_bytes?: number; checksum_sha256?: string };

export class BlobStorageError extends Error {
  constructor(message: string, readonly code: 'BLOB_STORAGE_UNAVAILABLE' | 'BLOB_FILE_TOO_LARGE'
    | 'BLOB_UPLOAD_SIZE_MISMATCH' | 'BLOB_UPLOAD_CHECKSUM_MISMATCH') {
    super(message);
  }
}

/**
 * Persistent local-disk storage for blob bytes.
 *
 * The provider name is stored on every object row, so a second provider can be
 * added later without rewriting the rows written today; readers dispatch on the
 * stored provider instead of assuming this one.
 */
@Injectable()
export class BlobStorageService {
  readonly provider = 'local';

  constructor(private readonly config: ConfigService, private readonly settings: SettingsService) {}

  getStoragePath(): string {
    const configured = this.settings.getCached('blobs_storage_path')
      || String(this.config.get('blobs.storagePath') || process.env.BLOBS_STORAGE_PATH || '');
    if (!configured || !isAbsolute(configured) || resolve(configured) !== configured || parse(configured).root === configured) {
      throw new BlobStorageError('Blob storage path must be an absolute non-root path', 'BLOB_STORAGE_UNAVAILABLE');
    }
    return configured;
  }

  isConfigured(): boolean {
    try {
      this.getStoragePath();
      return true;
    } catch {
      return false;
    }
  }

  /** Streams to a private temp file, verifying size and SHA-256 before the rename. */
  async writeObject(
    objectKey: string,
    source: Readable,
    expectedSize: number,
    expectedSha256: string,
    maxBytes: number,
  ): Promise<void> {
    const target = this.objectPath(objectKey);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const temporary = join(dirname(target), `.${randomUUID()}.upload`);
    const hash = createHash('sha256');
    let size = 0;
    const verify = new Transform({
      transform(chunk: Buffer | string, _encoding, callback) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > maxBytes || size > expectedSize) {
          callback(new BlobStorageError('Blob exceeds its declared size', 'BLOB_FILE_TOO_LARGE'));
          return;
        }
        hash.update(bytes);
        callback(null, bytes);
      },
    });

    try {
      await pipeline(source, verify, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
      if (size !== expectedSize) throw new BlobStorageError('Blob size does not match its declaration', 'BLOB_UPLOAD_SIZE_MISMATCH');
      if (hash.digest('hex') !== expectedSha256) {
        throw new BlobStorageError('Blob checksum does not match its declaration', 'BLOB_UPLOAD_CHECKSUM_MISMATCH');
      }
      await rename(temporary, target);
    } catch (error: any) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (error instanceof BlobStorageError) throw error;
      throw new BlobStorageError('Could not write blob to local storage', 'BLOB_STORAGE_UNAVAILABLE');
    }
  }

  async statObject(objectKey: string): Promise<BlobObjectInfo> {
    try {
      const info = await stat(this.objectPath(objectKey));
      if (!info.isFile()) return { exists: false };
      return { exists: true, size_bytes: info.size };
    } catch (error: any) {
      if (error?.code === 'ENOENT') return { exists: false };
      throw new BlobStorageError('Could not inspect blob in local storage', 'BLOB_STORAGE_UNAVAILABLE');
    }
  }

  async verifyObject(objectKey: string, expectedSize: number, expectedSha256: string, maxBytes: number): Promise<boolean> {
    const objectPath = this.objectPath(objectKey);
    let info;
    try { info = await stat(objectPath); }
    catch (error: any) {
      if (error?.code === 'ENOENT') return false;
      throw new BlobStorageError('Could not inspect blob in local storage', 'BLOB_STORAGE_UNAVAILABLE');
    }
    if (!info.isFile() || info.size !== expectedSize || info.size > maxBytes) return false;

    const hash = createHash('sha256');
    let size = 0;
    try {
      for await (const chunk of createReadStream(objectPath)) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > maxBytes || size > expectedSize) return false;
        hash.update(bytes);
      }
    } catch {
      throw new BlobStorageError('Could not read blob from local storage', 'BLOB_STORAGE_UNAVAILABLE');
    }
    return size === expectedSize && hash.digest('hex') === expectedSha256;
  }

  async openObject(objectKey: string): Promise<{ stream: Readable; size: number; last_modified: Date }> {
    const objectPath = this.objectPath(objectKey);
    const info = await stat(objectPath).catch((error: any) => {
      if (error?.code === 'ENOENT') return null;
      throw new BlobStorageError('Could not inspect blob in local storage', 'BLOB_STORAGE_UNAVAILABLE');
    });
    if (!info?.isFile()) throw new BlobStorageError('Blob is missing from local storage', 'BLOB_STORAGE_UNAVAILABLE');
    return { stream: createReadStream(objectPath), size: info.size, last_modified: info.mtime };
  }

  async deleteObject(objectKey: string): Promise<void> {
    try { await unlink(this.objectPath(objectKey)); }
    catch (error: any) {
      if (error?.code === 'ENOENT') return;
      throw new BlobStorageError('Could not delete blob from local storage', 'BLOB_STORAGE_UNAVAILABLE');
    }
  }

  /**
   * Object keys are opaque and server-generated (`blobs/<ns>/<owner-digest>/<uuid>`); this
   * re-derives the path and refuses anything that escapes the configured root, so
   * a corrupted or hand-edited row can never read outside the storage directory.
   */
  private objectPath(objectKey: string): string {
    // `blobs/<namespace>/<owner digest>/<uuid>`; anything else was not written by this service.
    if (!/^blobs\/[a-z0-9][a-z0-9_-]{0,63}\/[0-9a-f]{32}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(objectKey)) {
      throw new BlobStorageError('Unsafe blob object identifier', 'BLOB_STORAGE_UNAVAILABLE');
    }
    const root = this.getStoragePath();
    const objectPath = resolve(root, ...objectKey.split('/'));
    if (!objectPath.startsWith(root + '/') && !objectPath.startsWith(root + '\\')) {
      throw new BlobStorageError('Blob object is outside the configured storage path', 'BLOB_STORAGE_UNAVAILABLE');
    }
    return objectPath;
  }
}

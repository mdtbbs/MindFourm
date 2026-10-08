import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { isCloudSaveStorageConfigured } from './cloud-save-storage-config';

export type CloudSaveObjectInfo = { exists: boolean; size_bytes?: number; checksum_sha256?: string };

/** Persistent local-disk storage for private game save blobs. */
@Injectable()
export class CloudSaveStorageService {
  readonly provider = 'local';

  constructor(private readonly config: ConfigService, private readonly settings: SettingsService) {}

  getStoragePath(): string {
    const configured = this.settings.getCached('cloud_saves_storage_path')
      || String(this.config.get('cloudSaves.storagePath') || process.env.CLOUD_SAVES_STORAGE_PATH || '');
    if (!configured || !isAbsolute(configured) || resolve(configured) !== configured || parse(configured).root === configured) {
      throw this.storageError('Cloud save storage path must be an absolute non-root path');
    }
    return configured;
  }

  isConfigured(): boolean {
    try {
      return isCloudSaveStorageConfigured(this.getStoragePath());
    } catch {
      return false;
    }
  }

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
          callback(Object.assign(new Error('Save file exceeds its declared size'), { code: 'SAVE_FILE_TOO_LARGE' }));
          return;
        }
        hash.update(bytes);
        callback(null, bytes);
      },
    });

    try {
      await pipeline(source, verify, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
      if (size !== expectedSize) {
        throw Object.assign(new Error('Save file size does not match its declaration'), { code: 'SAVE_UPLOAD_SIZE_MISMATCH' });
      }
      if (hash.digest('hex') !== expectedSha256) {
        throw Object.assign(new Error('Save file checksum does not match its declaration'), { code: 'SAVE_UPLOAD_CHECKSUM_MISMATCH' });
      }
      await rename(temporary, target);
    } catch (error: any) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (error?.code === 'SAVE_FILE_TOO_LARGE' || error?.code === 'SAVE_UPLOAD_SIZE_MISMATCH'
        || error?.code === 'SAVE_UPLOAD_CHECKSUM_MISMATCH') throw error;
      throw this.storageError('Could not write cloud save to local storage');
    }
  }

  async statObject(objectKey: string): Promise<CloudSaveObjectInfo> {
    try {
      const info = await stat(this.objectPath(objectKey));
      if (!info.isFile()) return { exists: false };
      return { exists: true, size_bytes: info.size };
    } catch (error: any) {
      if (error?.code === 'ENOENT') return { exists: false };
      throw this.storageError('Could not inspect cloud save in local storage');
    }
  }

  async verifyObject(objectKey: string, expectedSize: number, expectedSha256: string, maxBytes: number): Promise<boolean> {
    const objectPath = this.objectPath(objectKey);
    let info;
    try { info = await stat(objectPath); }
    catch (error: any) {
      if (error?.code === 'ENOENT') return false;
      throw this.storageError('Could not inspect cloud save in local storage');
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
      throw this.storageError('Could not read cloud save from local storage');
    }
    return size === expectedSize && hash.digest('hex') === expectedSha256;
  }

  async openObject(objectKey: string): Promise<{ stream: Readable; size: number; last_modified: Date }> {
    const objectPath = this.objectPath(objectKey);
    const info = await stat(objectPath).catch((error: any) => {
      if (error?.code === 'ENOENT') return null;
      throw this.storageError('Could not inspect cloud save in local storage');
    });
    if (!info?.isFile()) throw this.storageError('Cloud save is missing from local storage');
    return { stream: createReadStream(objectPath), size: info.size, last_modified: info.mtime };
  }

  async deleteObject(objectKey: string): Promise<void> {
    try { await unlink(this.objectPath(objectKey)); }
    catch (error: any) {
      if (error?.code === 'ENOENT') return;
      throw this.storageError('Could not delete cloud save from local storage');
    }
  }

  private objectPath(objectKey: string): string {
    const match = /^cloud-saves\/(\d+)\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(objectKey);
    if (!match || Number(match[1]) <= 0 || !Number.isSafeInteger(Number(match[1]))) {
      throw this.storageError('Unsafe cloud save object identifier');
    }
    const root = this.getStoragePath();
    const objectPath = resolve(root, ...objectKey.split('/'));
    if (!objectPath.startsWith(root + '/') && !objectPath.startsWith(root + '\\')) {
      throw this.storageError('Cloud save object is outside the configured storage path');
    }
    return objectPath;
  }

  private storageError(message: string): Error {
    return Object.assign(new Error(message), { code: 'SAVE_STORAGE_UNAVAILABLE' });
  }
}

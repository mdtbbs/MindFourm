import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';

export type TimelapseStoredObject = { size: number; sha256: string };
export type TimelapseObjectInfo = { exists: boolean; size?: number; lastModified?: Date };

/** 只接受本模块生成的三种对象键，杜绝 key 拼接造成的路径穿越。 */
const OBJECT_KEY_RE = /^(?:source\/[0-9a-f-]{36}\.zip|video\/[0-9a-f-]{36}\.mp4|poster\/[0-9a-f-]{36}\.webp)$/i;

/**
 * 延时摄影对象的本地持久化存储。
 *
 * 与云存档/blob 相同的安全约束：存储根目录必须是绝对、非根路径；对象键只允许
 * 本模块定义的三种固定形状，写入时先落临时文件再原子 rename，读取时拒绝越界路径。
 */
@Injectable()
export class TimelapseStorageService {
  readonly provider = 'local';

  constructor(private readonly config: ConfigService, private readonly settings: SettingsService) {}

  getStoragePath(): string {
    const configured = this.settings.getCached('timelapse_storage_path')
      || String(this.config.get('timelapse.storagePath') || process.env.TIMELAPSE_STORAGE_PATH || '');
    if (!configured || !isAbsolute(configured) || resolve(configured) !== configured || parse(configured).root === configured) {
      throw this.storageError('延时摄影存储目录必须是绝对非根路径');
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

  /** 启动探针：确认目录存在且可写，不写入任何业务文件。 */
  async probe(): Promise<boolean> {
    try {
      const root = this.getStoragePath();
      await mkdir(root, { recursive: true, mode: 0o700 });
      const probePath = join(root, `.write-check-${randomUUID()}`);
      const handle = await open(probePath, 'wx', 0o600);
      await handle.close();
      await rm(probePath, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  private objectPath(objectKey: string): string {
    if (!OBJECT_KEY_RE.test(objectKey)) throw this.storageError('非法的延时摄影对象键');
    return join(this.getStoragePath(), objectKey);
  }

  async writeStream(
    objectKey: string,
    source: Readable,
    options: { maxBytes: number; expectedSize?: number; expectedSha256?: string },
  ): Promise<TimelapseStoredObject> {
    const target = this.objectPath(objectKey);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const temporary = join(dirname(target), `.${randomUUID()}.upload`);
    const hash = createHash('sha256');
    let size = 0;
    const verify = new Transform({
      transform(chunk: Buffer | string, _encoding, callback) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > options.maxBytes || (options.expectedSize !== undefined && size > options.expectedSize)) {
          callback(Object.assign(new Error('延时摄影文件超过大小上限'), { code: 'TIMELAPSE_FILE_TOO_LARGE' }));
          return;
        }
        hash.update(bytes);
        callback(null, bytes);
      },
    });
    try {
      await pipeline(source, verify, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
      const sha256 = hash.digest('hex');
      if (options.expectedSize !== undefined && size !== options.expectedSize) {
        throw Object.assign(new Error('延时摄影文件大小与声明不一致'), { code: 'TIMELAPSE_SIZE_MISMATCH' });
      }
      if (options.expectedSha256 && sha256 !== options.expectedSha256) {
        throw Object.assign(new Error('延时摄影文件 SHA-256 与声明不一致'), { code: 'TIMELAPSE_CHECKSUM_MISMATCH' });
      }
      await rename(temporary, target);
      return { size, sha256 };
    } catch (error: any) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (['TIMELAPSE_FILE_TOO_LARGE', 'TIMELAPSE_SIZE_MISMATCH', 'TIMELAPSE_CHECKSUM_MISMATCH'].includes(error?.code)) throw error;
      throw this.storageError('无法写入延时摄影本地存储');
    }
  }

  async writeBuffer(objectKey: string, bytes: Buffer, maxBytes: number): Promise<TimelapseStoredObject> {
    return this.writeStream(objectKey, Readable.from([bytes]), { maxBytes });
  }

  async statObject(objectKey: string): Promise<TimelapseObjectInfo> {
    try {
      const info = await stat(this.objectPath(objectKey));
      if (!info.isFile()) return { exists: false };
      return { exists: true, size: info.size, lastModified: info.mtime };
    } catch (error: any) {
      if (error?.code === 'ENOENT') return { exists: false };
      throw this.storageError('无法读取延时摄影存储对象');
    }
  }

  async openObject(
    objectKey: string,
    range?: { start: number; end: number },
  ): Promise<{ stream: Readable; size: number; lastModified: Date } | null> {
    const objectPath = this.objectPath(objectKey);
    const info = await stat(objectPath).catch((error: any) => {
      if (error?.code === 'ENOENT') return null;
      throw this.storageError('无法读取延时摄影存储对象');
    });
    if (!info?.isFile()) return null;
    const stream = range
      ? createReadStream(objectPath, { start: range.start, end: range.end })
      : createReadStream(objectPath);
    return { stream, size: info.size, lastModified: info.mtime };
  }

  async readPrefix(objectKey: string, length: number): Promise<Buffer> {
    const opened = await this.openObject(objectKey);
    if (!opened) return Buffer.alloc(0);
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for await (const chunk of opened.stream) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(bytes);
        total += bytes.length;
        if (total >= length) break;
      }
    } finally {
      opened.stream.destroy();
    }
    return Buffer.concat(chunks).subarray(0, length);
  }

  async deleteObject(objectKey: string): Promise<void> {
    try {
      await rm(this.objectPath(objectKey), { force: true });
    } catch (error: any) {
      if (error?.code === 'ENOENT') return;
      throw this.storageError('无法删除延时摄影存储对象');
    }
  }

  private storageError(message: string): Error {
    return Object.assign(new Error(message), { code: 'TIMELAPSE_STORAGE_UNAVAILABLE' });
  }
}

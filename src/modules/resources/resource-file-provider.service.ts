import { Injectable, NotFoundException } from '@nestjs/common';
import { ResourceFile } from '@entities/resource-file.entity';
import { assertSafeRedirectUrl } from '@common/utils/safe-url.util';
import { ResourceStorageService } from './resource-storage.service';
import { ResourceStorageClientService } from './resource-storage-client.service';
import { MflClientService } from './mfl-client.service';

export type ResourceDownloadTarget = { kind: 'redirect'; url: string } | { kind: 'managed'; path: string; size: number };

/** A small backend switch for file reads and download targets. */
@Injectable()
export class ResourceFileProviderService {
  constructor(
    private readonly res: ResourceStorageClientService,
    private readonly managed: ResourceStorageService,
    private readonly mfl: MflClientService,
  ) {}

  async getDownloadTarget(file: ResourceFile, context: { private?: boolean } = {}): Promise<ResourceDownloadTarget> {
    switch (file.storage_backend || file.delivery_mode) {
      case 'res':
        return { kind: 'redirect', url: context.private ? await this.getPrivateUrl(file) : this.getPublicUrl(file) };
      case 'external': {
        const url = file.external_url || file.storage_key;
        if (!url) throw new NotFoundException('文件下载地址不存在');
        assertSafeRedirectUrl(url);
        return { kind: 'redirect', url };
      }
      case 'mfl': {
        const url = file.provider_file_id
          ? await this.mfl.resolveDownloadUrl(file.provider_file_id).catch(() => file.external_url || file.storage_key || this.mfl.getDownloadUrl(file.provider_file_id!))
          : file.external_url || file.storage_key;
        if (!url) throw new NotFoundException('MFL 文件下载地址不存在');
        assertSafeRedirectUrl(url);
        return { kind: 'redirect', url };
      }
      case 'managed':
      case 'local': {
        if (!file.storage_key) throw new NotFoundException('文件存储地址不存在');
        const stat = await this.managed.statManagedFile(file.storage_key);
        return { kind: 'managed', ...stat };
      }
      default:
        throw new NotFoundException('不支持的文件存储类型');
    }
  }

  getPublicUrl(file: ResourceFile): string {
    if (file.storage_backend !== 'res' || !file.provider_object_id) throw new NotFoundException('RES 文件标识不存在');
    return this.res.buildPublicDownloadUrl(file.provider_object_id, file.original_filename || file.display_name || 'file');
  }

  async getPrivateUrl(file: ResourceFile): Promise<string> {
    if (file.storage_backend !== 'res' || !file.provider_object_id) throw new NotFoundException('RES 文件标识不存在');
    return (await this.res.createPrivateDownloadUrl(file.provider_object_id, {
      filename: file.original_filename || file.display_name || 'file',
      expires_in: 300,
    })).url;
  }

  async getReadableContent(file: ResourceFile, maxBytes: number): Promise<Buffer> {
    switch (file.storage_backend || file.delivery_mode) {
      case 'res':
        if (!file.provider_object_id) throw new NotFoundException('RES 文件标识不存在');
        return this.res.getObjectContent(file.provider_object_id, { maxBytes });
      case 'managed':
      case 'local':
        if (!file.storage_key) throw new NotFoundException('文件存储地址不存在');
        return this.managed.readManagedFile(file.storage_key, maxBytes);
      case 'mfl': {
        const target = await this.getDownloadTarget(file);
        if (target.kind !== 'redirect') throw new NotFoundException('MFL 文件下载地址不存在');
        const response = await fetch(target.url, { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new NotFoundException('MFL 文件暂不可用');
        const size = Number(response.headers.get('content-length'));
        if (size > maxBytes) throw new NotFoundException('文件超过读取上限');
        const reader = response.body?.getReader();
        if (!reader) throw new NotFoundException('MFL 文件内容不可读取');
        const chunks: Uint8Array[] = [];
        let total = 0;
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            total += next.value.byteLength;
            if (total > maxBytes) throw new NotFoundException('文件超过读取上限');
            chunks.push(next.value);
          }
        } finally { await reader.cancel().catch(() => undefined); }
        return Buffer.concat(chunks);
      }
      default:
        throw new NotFoundException('文件内容不可读取');
    }
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { lookup } from 'dns/promises';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { BlockList, isIP } from 'net';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { join } from 'path';
import { assertSafeUploadedFile } from '../../common/utils/upload-safety.util';
import { MAX_PUBLIC_IMAGE_SIZE, PUBLIC_IMAGE_UPLOAD_DIR } from './public-image-upload';
import { UploadsService } from './uploads.service';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix);
const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['2001::', 32], ['2001:2::', 48], ['2001:10::', 28], ['2001:20::', 28], ['2001:db8::', 32], ['2002::', 16]] as const) blocked.addSubnet(address, prefix, 'ipv6');

export function isPublicImageAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  return family === 6 && globalIpv6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export async function resolveImageTarget(value: string, resolve = lookup) {
  let url: URL;
  try { url = new URL(value); } catch { throw new BadRequestException('图片地址无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || (url.port && !['80', '443'].includes(url.port))) throw new BadRequestException('图片地址仅支持公开 HTTP(S) 地址');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await Promise.race([
      resolve(hostname, { all: true, verbatim: true }),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new BadRequestException('图片域名解析超时')), 5000); }),
    ]);
    if (!addresses.length || addresses.some(({ address }) => !isPublicImageAddress(address))) throw new BadRequestException('图片地址不能指向内网或保留地址');
    return { url, address: addresses[0].address, family: addresses[0].family as 4 | 6 };
  } finally { clearTimeout(timer); }
}

function imageType(bytes: Buffer): { mime: string; extension: string } {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: 'image/png', extension: '.png' };
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return { mime: 'image/jpeg', extension: '.jpg' };
  if (['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return { mime: 'image/gif', extension: '.gif' };
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', extension: '.webp' };
  throw new BadRequestException('远程文件不是受支持的 PNG、JPEG、GIF 或 WebP 图片');
}

@Injectable()
export class RemoteImageImportService {
  constructor(private readonly uploads: UploadsService) {}

  async importImage(source: string) {
    try {
      const bytes = await this.download(source);
      return await this.store(bytes);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('外站图片下载失败，请检查地址或稍后重试');
    }
  }

  async download(source: string): Promise<Buffer> {
    let current = source;
    const deadline = Date.now() + 20_000;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      // Every redirect gets a new DNS validation. The socket uses this exact
      // validated address, rather than doing a second lookup vulnerable to rebinding.
      const target = await resolveImageTarget(current);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new BadRequestException('图片下载超时');
      const options = { lookup: ((_host: string, options: { all?: boolean }, callback: (error: null, address: unknown, family?: number) => void) => {
        if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      }) as typeof import('dns').lookup };
      const httpAgent = new HttpAgent(options);
      const httpsAgent = new HttpsAgent(options);
      let response;
      try {
        response = await axios.get<Buffer>(target.url.href, {
          responseType: 'arraybuffer', timeout: remaining, signal: AbortSignal.timeout(remaining), maxRedirects: 0, proxy: false,
          maxContentLength: MAX_PUBLIC_IMAGE_SIZE, maxBodyLength: MAX_PUBLIC_IMAGE_SIZE,
          httpAgent, httpsAgent, validateStatus: () => true,
          headers: { Accept: 'image/png,image/jpeg,image/gif,image/webp', 'User-Agent': 'MindFourm-Image-Import', 'Accept-Encoding': 'identity' },
        });
      } finally { httpAgent.destroy(); httpsAgent.destroy(); }
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirects === 3 || !response.headers.location) throw new BadRequestException('图片重定向次数过多或地址缺失');
        current = new URL(response.headers.location, target.url).href;
        continue;
      }
      if (response.status !== 200) throw new BadRequestException(`外站图片下载失败（HTTP ${response.status}）`);
      const bytes = Buffer.from(response.data);
      if (!bytes.length || bytes.length > MAX_PUBLIC_IMAGE_SIZE) throw new BadRequestException('远程图片为空或超过 2MB');
      imageType(bytes);
      return bytes;
    }
    throw new BadRequestException('图片下载失败');
  }

  async store(bytes: Buffer) {
    const type = imageType(bytes);
    const filename = `${Date.now()}-${randomUUID()}${type.extension}`;
    const path = join(PUBLIC_IMAGE_UPLOAD_DIR, filename);
    await fs.mkdir(PUBLIC_IMAGE_UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path, bytes, { flag: 'wx' });
    const file = { path, filename, originalname: `imported-image${type.extension}`, mimetype: type.mime, size: bytes.length } as Express.Multer.File;
    try {
      await assertSafeUploadedFile(file, MAX_PUBLIC_IMAGE_SIZE);
      return this.uploads.toPublicImageResult(file);
    } catch (error) {
      await fs.unlink(path).catch(() => undefined);
      throw error;
    }
  }
}

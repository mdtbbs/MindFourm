/**
 * 仅测试使用的 ZIP/PNG/manifest/metrics 构造器。
 *
 * 生产代码不引用本文件；Jest 的 testMatch 也不会把它当成测试执行。
 * 放在 src 下是为了让 `npx tsc`/`ts-jest` 无需额外路径配置。
 */

import { deflateRawSync } from 'node:zlib';
import { crc32 } from './zip';

export interface ZipEntrySpec {
  name: string | Buffer;
  data?: Buffer;
  method?: 0 | 8;
  flags?: number;
  crc?: number;
  uncompressedSize?: number;
  compressedSize?: number;
  localName?: string | Buffer;
  unixMode?: number;
  versionMadeBy?: number;
}

export interface ZipOptions {
  disk?: number;
  zip64?: boolean;
  comment?: string;
}

function normalizeName(name: string | Buffer): Buffer {
  return Buffer.isBuffer(name) ? name : Buffer.from(name, 'utf8');
}

/** 自建最小 ZIP（store + deflate），不依赖第三方库。 */
export function buildZip(entries: ZipEntrySpec[], options: ZipOptions = {}): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const spec of entries) {
    const name = normalizeName(spec.name);
    const localName = normalizeName(spec.localName ?? spec.name);
    const raw = spec.data ?? Buffer.alloc(0);
    const method = spec.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(raw) : raw;
    const crc = spec.crc ?? crc32(raw);
    const uncompressedSize = spec.uncompressedSize ?? raw.length;
    const compressedSize = spec.compressedSize ?? compressed.length;
    const flags = spec.flags ?? 0x0800;
    const unixMode = spec.unixMode;
    const versionMadeBy = spec.versionMadeBy ?? (unixMode === undefined ? 20 : (3 << 8) | 20);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(localName.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, localName, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(versionMadeBy, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(options.zip64 ? 0xffffffff : compressedSize, 20);
    central.writeUInt32LE(options.zip64 ? 0xffffffff : uncompressedSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(unixMode === undefined ? 0 : (unixMode << 16) >>> 0, 38);
    central.writeUInt32LE(options.zip64 ? 0xffffffff : offset, 42);
    centralParts.push(central, name);

    offset += local.length + localName.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const comment = Buffer.from(options.comment ?? '', 'utf8');
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(options.disk ?? 0, 4);
  eocd.writeUInt16LE(options.disk ?? 0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd, comment]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 只构造 PNG 头（Worker 只校验头，不解码像素）。 */
export function pngHeader(overrides: Partial<{
  signature: Buffer;
  width: number;
  height: number;
  ihdrLength: number;
  ihdrType: string;
  bitDepth: number;
  colorType: number;
  compression: number;
  filter: number;
  interlace: number;
}> = {}): Buffer {
  const buffer = Buffer.alloc(33);
  (overrides.signature ?? PNG_SIGNATURE).copy(buffer, 0);
  buffer.writeUInt32BE(overrides.ihdrLength ?? 13, 8);
  buffer.write(overrides.ihdrType ?? 'IHDR', 12, 'latin1');
  buffer.writeUInt32BE(overrides.width ?? 512, 16);
  buffer.writeUInt32BE(overrides.height ?? 512, 20);
  buffer[24] = overrides.bitDepth ?? 8;
  buffer[25] = overrides.colorType ?? 2;
  buffer[26] = overrides.compression ?? 0;
  buffer[27] = overrides.filter ?? 0;
  buffer[28] = overrides.interlace ?? 0;
  return buffer;
}

export function manifestBuffer(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(JSON.stringify({
    schema_version: 1,
    frame_count: 5,
    map_name: 'Serpulo',
    map_width: 512,
    map_height: 512,
    game_mode: 'survival',
    game_version: 'v146',
    is_multiplayer: false,
    ...overrides,
  }));
}

export function metricLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    idx: 0,
    elapsed_sec: 0,
    wave: 1,
    power_gen: 100,
    power_use: 80,
    power_stored: 20,
    core_items: 300,
    item_rate_per_min: 12,
    units_ally: 3,
    units_enemy: 4,
    buildings_ally: 5,
    players_online: 1,
    ...overrides,
  });
}

export function metricsJsonl(lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

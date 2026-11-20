/**
 * 最小化的安全 ZIP 读取器（只依赖 Node 内置 zlib）。
 *
 * 不落盘、不执行压缩包内任何路径：中央目录只用于建立索引，解压时按索引
 * 读取本地头并把内容返回给调用方，由调用方用自己的固定文件名写盘。
 *
 * 明确拒绝：路径穿越、绝对路径、反斜杠、盘符、NUL/控制字符、符号链接、
 * 加密、分卷、zip64、未知压缩方法、声明尺寸超限与 zip bomb。
 */

import { inflateRawSync } from 'node:zlib';
import {
  TIMELAPSE_MAX_FRAME_BYTES,
  TIMELAPSE_MAX_MANIFEST_BYTES,
  TIMELAPSE_MAX_SOURCE_BYTES,
  TIMELAPSE_MAX_UNCOMPRESSED_BYTES,
} from '../../modules/timelapses/timelapse.constants';
import { TimelapseArchiveError } from './errors';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const EOCD_MIN_BYTES = 22;
const EOCD_MAX_COMMENT_BYTES = 0xffff;

/** metrics.jsonl 整文件上限：1000 行 × 4 KB。 */
export const ZIP_MAX_METRICS_BYTES = 4 * 1024 * 1024;

export const ZIP_LIMITS = {
  maxEntries: 512,
  maxNameBytes: 200,
  maxEntryUncompressedBytes: TIMELAPSE_MAX_FRAME_BYTES,
  maxManifestBytes: TIMELAPSE_MAX_MANIFEST_BYTES,
  maxMetricsBytes: ZIP_MAX_METRICS_BYTES,
  maxTotalUncompressedBytes: TIMELAPSE_MAX_UNCOMPRESSED_BYTES,
  maxArchiveBytes: TIMELAPSE_MAX_SOURCE_BYTES,
} as const;

export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  unixMode: number;
  isDirectory: boolean;
}

function invalid(message: string): never {
  throw new TimelapseArchiveError('TIMELAPSE_ZIP_INVALID', message);
}

function unsupported(message: string): never {
  throw new TimelapseArchiveError('TIMELAPSE_ZIP_UNSUPPORTED', message);
}

function bomb(message: string): never {
  throw new TimelapseArchiveError('TIMELAPSE_ZIP_BOMB', message);
}

function unsafe(message: string): never {
  throw new TimelapseArchiveError('TIMELAPSE_ZIP_UNSAFE_PATH', message);
}

function ensureRange(buffer: Buffer, offset: number, length: number, message: string): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    invalid(message);
  }
}

function readUInt16LE(buffer: Buffer, offset: number, message: string): number {
  ensureRange(buffer, offset, 2, message);
  return buffer.readUInt16LE(offset);
}

function readUInt32LE(buffer: Buffer, offset: number, message: string): number {
  ensureRange(buffer, offset, 4, message);
  return buffer.readUInt32LE(offset);
}

let crcTable: Uint32Array | null = null;

/** 标准 CRC-32（IEEE 802.3），用于校验每个解压条目。 */
export function crc32(buffer: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 1) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

/** 定位 EOCD（允许末尾有最多 65535 字节注释）。 */
export function findEndOfCentralDirectory(buffer: Buffer): number {
  if (!Buffer.isBuffer(buffer) || buffer.length < EOCD_MIN_BYTES) invalid('源包不是有效的 ZIP 文件。');
  const minOffset = Math.max(0, buffer.length - EOCD_MIN_BYTES - EOCD_MAX_COMMENT_BYTES);
  for (let offset = buffer.length - EOCD_MIN_BYTES; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + EOCD_MIN_BYTES + commentLength === buffer.length) return offset;
  }
  invalid('源包不是有效的 ZIP 文件（缺少中央目录）。');
}

/**
 * 路径安全校验。返回值只用于日志/索引，调用方不得用压缩包内路径拼磁盘路径。
 */
function decodeSafeEntryName(bytes: Buffer, utf8: boolean): string {
  if (bytes.length === 0 || bytes.length > ZIP_LIMITS.maxNameBytes) unsafe('压缩包条目名称长度不合法。');
  const name = bytes.toString(utf8 ? 'utf8' : 'latin1');
  if (!name) unsafe('压缩包条目名称为空。');
  if (name.includes('\\')) unsafe('压缩包条目名称不能包含反斜杠。');
  if (/[\u0000-\u001f\u007f]/.test(name)) unsafe('压缩包条目名称包含控制字符。');
  if (name.startsWith('/')) unsafe('压缩包不能包含绝对路径。');
  const isDirectory = name.endsWith('/');
  const segments = name.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (isDirectory && index === segments.length - 1 && segment === '') continue;
    if (!segment || segment === '.' || segment === '..') unsafe('压缩包包含路径穿越条目。');
    if (/^[A-Za-z]:/.test(segment)) unsafe('压缩包条目不能使用盘符路径。');
  }
  return name;
}

function entrySizeLimit(name: string): number {
  if (name === 'manifest.json') return ZIP_LIMITS.maxManifestBytes;
  if (name === 'metrics.jsonl') return ZIP_LIMITS.maxMetricsBytes;
  return ZIP_LIMITS.maxEntryUncompressedBytes;
}

/** 读取中央目录。只做结构/安全校验，不读取条目内容。 */
export function readZipEntries(buffer: Buffer): ZipEntry[] {
  if (!Buffer.isBuffer(buffer) || buffer.length < EOCD_MIN_BYTES || buffer.length > ZIP_LIMITS.maxArchiveBytes) {
    invalid('源包大小不在允许范围内。');
  }
  const eocd = findEndOfCentralDirectory(buffer);
  const disk = readUInt16LE(buffer, eocd + 4, '中央目录损坏。');
  const centralDisk = readUInt16LE(buffer, eocd + 6, '中央目录损坏。');
  const diskEntryCount = readUInt16LE(buffer, eocd + 8, '中央目录损坏。');
  const entryCount = readUInt16LE(buffer, eocd + 10, '中央目录损坏。');
  const centralSize = readUInt32LE(buffer, eocd + 12, '中央目录损坏。');
  const centralOffset = readUInt32LE(buffer, eocd + 16, '中央目录损坏。');

  if (disk !== 0 || centralDisk !== 0 || diskEntryCount !== entryCount) {
    unsupported('不支持分卷 ZIP。');
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    unsupported('不支持 zip64 压缩包。');
  }
  if (eocd >= 20 && readUInt32LE(buffer, eocd - 20, '中央目录损坏。') === ZIP64_LOCATOR_SIGNATURE) {
    unsupported('不支持 zip64 压缩包。');
  }
  if (entryCount === 0) invalid('压缩包为空。');
  if (entryCount > ZIP_LIMITS.maxEntries) bomb(`压缩包条目数不能超过 ${ZIP_LIMITS.maxEntries}。`);
  if (centralOffset + centralSize > eocd) invalid('中央目录越界。');

  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let totalUncompressed = 0;
  let offset = centralOffset;
  const centralEnd = centralOffset + centralSize;

  for (let index = 0; index < entryCount; index += 1) {
    ensureRange(buffer, offset, 46, '中央目录损坏。');
    if (readUInt32LE(buffer, offset, '中央目录损坏。') !== CENTRAL_SIGNATURE) invalid('中央目录损坏。');
    const versionMadeBy = readUInt16LE(buffer, offset + 4, '中央目录损坏。');
    const flags = readUInt16LE(buffer, offset + 8, '中央目录损坏。');
    const method = readUInt16LE(buffer, offset + 10, '中央目录损坏。');
    const crc = readUInt32LE(buffer, offset + 16, '中央目录损坏。');
    const compressedSize = readUInt32LE(buffer, offset + 20, '中央目录损坏。');
    const uncompressedSize = readUInt32LE(buffer, offset + 24, '中央目录损坏。');
    const nameLength = readUInt16LE(buffer, offset + 28, '中央目录损坏。');
    const extraLength = readUInt16LE(buffer, offset + 30, '中央目录损坏。');
    const commentLength = readUInt16LE(buffer, offset + 32, '中央目录损坏。');
    const startDisk = readUInt16LE(buffer, offset + 34, '中央目录损坏。');
    const externalAttributes = readUInt32LE(buffer, offset + 38, '中央目录损坏。');
    const localOffset = readUInt32LE(buffer, offset + 42, '中央目录损坏。');
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > centralEnd) invalid('中央目录条目越界。');
    if (startDisk !== 0) unsupported('不支持分卷 ZIP。');
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      unsupported('不支持 zip64 压缩包。');
    }
    if (nameLength === 0) unsafe('压缩包条目名称为空。');
    ensureRange(buffer, offset + 46, nameLength, '中央目录损坏。');
    const name = decodeSafeEntryName(buffer.subarray(offset + 46, offset + 46 + nameLength), Boolean(flags & 0x0800));
    if (seen.has(name)) invalid(`压缩包包含重复条目：${name}`);
    seen.add(name);

    if (flags & 0x0001 || flags & 0x0040) {
      throw new TimelapseArchiveError('TIMELAPSE_ZIP_ENCRYPTED', '不支持加密的压缩包。');
    }
    if (flags & 0x2000) unsupported('不支持带掩码头的 ZIP。');
    if (method !== 0 && method !== 8) {
      throw new TimelapseArchiveError('TIMELAPSE_ZIP_UNSUPPORTED_METHOD', '压缩包使用了不支持的压缩方法。');
    }

    const unix = (versionMadeBy >>> 8) === 3;
    const unixMode = unix ? (externalAttributes >>> 16) & 0xffff : 0;
    const fileType = unixMode & 0xf000;
    if (fileType === 0xa000) {
      throw new TimelapseArchiveError('TIMELAPSE_ZIP_SYMLINK', '压缩包不能包含符号链接。');
    }
    const isDirectory = name.endsWith('/') || fileType === 0x4000;
    if (!isDirectory && method === 0 && compressedSize !== uncompressedSize) {
      invalid(`条目 ${name} 的存储尺寸不一致。`);
    }
    if (localOffset + 30 > centralOffset) invalid(`条目 ${name} 的本地头越界。`);

    const limit = entrySizeLimit(name);
    if (!isDirectory && uncompressedSize > limit) {
      bomb(`条目 ${name} 解压后超过 ${limit} 字节上限。`);
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > ZIP_LIMITS.maxTotalUncompressedBytes) {
      bomb(`压缩包解压总量超过 ${ZIP_LIMITS.maxTotalUncompressedBytes} 字节上限。`);
    }

    entries.push({ name, method, flags, crc, compressedSize, uncompressedSize, localOffset, unixMode, isDirectory });
    offset = entryEnd;
  }
  if (offset !== centralEnd) invalid('中央目录长度与条目不一致。');
  return entries;
}

function inflateEntry(compressed: Buffer, entry: ZipEntry): Buffer {
  try {
    return inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.uncompressedSize + 1) });
  } catch (error: any) {
    if (error?.code === 'ERR_BUFFER_TOO_LARGE') {
      bomb(`条目 ${entry.name} 的实际解压数据超过声明大小。`);
    }
    invalid(`条目 ${entry.name} 无法安全解压。`);
  }
}

/** 解压单个条目，校验实际长度与 CRC-32。 */
export function extractZipEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  if (entry.isDirectory) return Buffer.alloc(0);
  ensureRange(buffer, entry.localOffset, 30, `条目 ${entry.name} 的本地头缺失。`);
  if (readUInt32LE(buffer, entry.localOffset, '本地头损坏。') !== LOCAL_SIGNATURE) {
    invalid(`条目 ${entry.name} 的本地头损坏。`);
  }
  const localFlags = readUInt16LE(buffer, entry.localOffset + 6, '本地头损坏。');
  const localMethod = readUInt16LE(buffer, entry.localOffset + 8, '本地头损坏。');
  const nameLength = readUInt16LE(buffer, entry.localOffset + 26, '本地头损坏。');
  const extraLength = readUInt16LE(buffer, entry.localOffset + 28, '本地头损坏。');
  if (localFlags & 0x0001 || localFlags & 0x0040) {
    throw new TimelapseArchiveError('TIMELAPSE_ZIP_ENCRYPTED', '不支持加密的压缩包。');
  }
  if (localMethod !== entry.method) invalid(`条目 ${entry.name} 的压缩方法与索引不一致。`);
  ensureRange(buffer, entry.localOffset + 30, nameLength, '本地头损坏。');
  const localName = decodeSafeEntryName(
    buffer.subarray(entry.localOffset + 30, entry.localOffset + 30 + nameLength),
    Boolean(localFlags & 0x0800),
  );
  if (localName !== entry.name) invalid(`条目 ${entry.name} 的本地头名称与索引不一致。`);

  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  ensureRange(buffer, dataStart, entry.compressedSize, `条目 ${entry.name} 数据被截断。`);
  const compressed = buffer.subarray(dataStart, dataEnd);
  let result: Buffer;
  if (entry.method === 0) {
    result = Buffer.from(compressed);
  } else {
    result = inflateEntry(compressed, entry);
  }
  if (result.length !== entry.uncompressedSize) {
    invalid(`条目 ${entry.name} 的解压长度与声明不一致。`);
  }
  if (crc32(result) !== entry.crc) {
    invalid(`条目 ${entry.name} 的 CRC-32 校验失败。`);
  }
  return result;
}

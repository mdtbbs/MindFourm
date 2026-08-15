import { BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

const ZIP_EXTENSIONS = new Set(['.zip', '.jar', '.docx', '.xlsx']);
const MAX_ARCHIVE_ENTRIES = 5_000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;
const MAX_ARCHIVE_RATIO = 100;
const MAX_IMAGE_DIMENSION = 16_384;
const MAX_IMAGE_PIXELS = 80_000_000;

export async function assertSafeUploadedFile(file: Pick<Express.Multer.File, 'path' | 'originalname' | 'size'>, maxBytes: number): Promise<void> {
  const stat = await fs.stat(file.path);
  if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes || file.size > maxBytes) {
    throw new BadRequestException('上传文件大小无效');
  }
  const extension = path.extname(file.originalname).toLowerCase();
  // Dimensions in JPEG metadata are allowed to appear after EXIF/XMP blocks.
  // A bounded prefix catches those files without ever decoding attacker data.
  const probe = await readPrefix(file.path, 256 * 1024);
  assertExpectedSignature(extension, probe);
  assertSafeImageDimensions(extension, probe);
  if (ZIP_EXTENSIONS.has(extension)) await inspectZip(file.path);
  if (['.json', '.hjson', '.txt', '.md', '.csv'].includes(extension) && probe.includes(0)) {
    throw new BadRequestException('文本文件包含二进制内容');
  }
}

function assertSafeImageDimensions(extension: string, source: Buffer): void {
  const dimensions = getImageDimensions(extension, source);
  if (!dimensions) return;
  const { width, height } = dimensions;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new BadRequestException('图片尺寸超出安全限制');
  }
}

function getImageDimensions(extension: string, source: Buffer): { width: number; height: number } | null {
  if (extension === '.png' && source.length >= 24) {
    return { width: source.readUInt32BE(16), height: source.readUInt32BE(20) };
  }
  if (extension === '.gif' && source.length >= 10) {
    return { width: source.readUInt16LE(6), height: source.readUInt16LE(8) };
  }
  if (extension === '.webp') return getWebpDimensions(source);
  if (extension === '.jpg' || extension === '.jpeg') return getJpegDimensions(source);
  return null;
}

function getWebpDimensions(source: Buffer): { width: number; height: number } | null {
  if (source.length < 30) return null;
  const chunkType = source.subarray(12, 16).toString('ascii');
  // VP8X holds the canvas size as little-endian 24-bit values, minus one.
  if (chunkType === 'VP8X') {
    return {
      width: source.readUIntLE(24, 3) + 1,
      height: source.readUIntLE(27, 3) + 1,
    };
  }
  return null;
}

function getJpegDimensions(source: Buffer): { width: number; height: number } | null {
  if (source.length < 4) return null;
  let offset = 2;
  while (offset + 9 <= source.length) {
    if (source[offset] !== 0xff) return null;
    while (source[offset] === 0xff) offset += 1;
    const marker = source[offset++];
    // Markers without a length (SOI/EOI/restart) cannot contain dimensions.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > source.length) return null;
    const length = source.readUInt16BE(offset);
    if (length < 2 || offset + length > source.length) return null;
    // SOF markers describe the frame. Exclude entropy tables and differential
    // markers that do not carry width/height at these offsets.
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame && length >= 7) {
      return { height: source.readUInt16BE(offset + 3), width: source.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function assertExpectedSignature(extension: string, prefix: Buffer): void {
  const has = (signature: number[], offset = 0) => signature.every((byte, index) => prefix[offset + index] === byte);
  const zip = has([0x50, 0x4b, 0x03, 0x04]) || has([0x50, 0x4b, 0x05, 0x06]) || has([0x50, 0x4b, 0x07, 0x08]);
  const expected: Record<string, boolean> = {
    '.png': has([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    '.jpg': has([0xff, 0xd8, 0xff]),
    '.jpeg': has([0xff, 0xd8, 0xff]),
    '.gif': has([0x47, 0x49, 0x46, 0x38]),
    '.webp': has([0x52, 0x49, 0x46, 0x46]) && prefix.subarray(8, 12).toString('ascii') === 'WEBP',
    '.pdf': prefix.subarray(0, 5).toString('ascii') === '%PDF-',
    '.gz': has([0x1f, 0x8b]),
    '.7z': has([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
    '.rar': has([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]),
    '.tar': prefix.subarray(257, 262).toString('ascii') === 'ustar',
    '.zip': zip,
    '.jar': zip,
    '.docx': zip,
    '.xlsx': zip,
  };
  if (extension in expected && !expected[extension]) {
    throw new BadRequestException('文件内容与扩展名不匹配');
  }
}

async function inspectZip(filePath: string): Promise<void> {
  const source = await fs.readFile(filePath);
  const eocd = findEndOfCentralDirectory(source);
  if (eocd < 0) throw new BadRequestException('ZIP 文件结构无效');
  const entries = source.readUInt16LE(eocd + 10);
  const centralSize = source.readUInt32LE(eocd + 12);
  const centralOffset = source.readUInt32LE(eocd + 16);
  if (entries > MAX_ARCHIVE_ENTRIES || centralOffset + centralSize > source.length) {
    throw new BadRequestException('ZIP 文件条目或目录大小超出限制');
  }
  let offset = centralOffset;
  let uncompressedTotal = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > source.length || source.readUInt32LE(offset) !== 0x02014b50) throw new BadRequestException('ZIP 中央目录损坏');
    const compressed = source.readUInt32LE(offset + 20);
    const uncompressed = source.readUInt32LE(offset + 24);
    const nameLength = source.readUInt16LE(offset + 28);
    const extraLength = source.readUInt16LE(offset + 30);
    const commentLength = source.readUInt16LE(offset + 32);
    const nameEnd = offset + 46 + nameLength;
    if (nameEnd > source.length) throw new BadRequestException('ZIP 文件名无效');
    const name = source.subarray(offset + 46, nameEnd).toString('utf8').replace(/\\/g, '/');
    if (!name || name.includes('\0') || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) {
      throw new BadRequestException('ZIP 包含不安全路径');
    }
    uncompressedTotal += uncompressed;
    if (uncompressedTotal > MAX_ARCHIVE_UNCOMPRESSED_BYTES || (uncompressed > 0 && uncompressed / Math.max(1, compressed) > MAX_ARCHIVE_RATIO)) {
      throw new BadRequestException('ZIP 解压后的数据超出安全限制');
    }
    offset = nameEnd + extraLength + commentLength;
  }
}

async function readPrefix(filePath: string, size: number): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await handle.read(buffer, 0, size, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function findEndOfCentralDirectory(source: Buffer): number {
  const start = Math.max(0, source.length - 65_557);
  for (let index = source.length - 22; index >= start; index -= 1) {
    if (source.readUInt32LE(index) === 0x06054b50) return index;
  }
  return -1;
}

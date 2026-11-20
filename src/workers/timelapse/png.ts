/**
 * PNG 头校验。
 *
 * Worker 只需要确认帧是合法尺寸的 PNG（防图片解压炸弹），不做完整解码；
 * 后续 ffmpeg 会自行拒绝损坏的图像。这里检查 8 字节魔数、IHDR 结构、
 * 宽高上限以及 bit depth / color type 的合法组合。
 */

import { TIMELAPSE_MAX_FRAME_DIMENSION } from '../../modules/timelapses/timelapse.constants';
import { TimelapseArchiveError } from './errors';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** IHDR 固定 13 字节数据；加 8 字节签名后至少需要 33 字节才能读到 CRC。 */
const PNG_HEADER_MIN_BYTES = 8 + 4 + 4 + 13 + 4;

export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}

/** 各 color type 允许的 bit depth（PNG 规范表 11.1）。 */
const ALLOWED_BIT_DEPTHS: Record<number, readonly number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16],
};

function invalid(message: string): never {
  throw new TimelapseArchiveError('TIMELAPSE_FRAME_INVALID', message);
}

/** 校验 PNG 头，失败抛 `TIMELAPSE_FRAME_INVALID`。 */
export function validatePngHeader(buffer: Buffer, label = '帧图'): PngInfo {
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_HEADER_MIN_BYTES) {
    invalid(`${label}不是完整的 PNG 文件。`);
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    invalid(`${label}不是合法的 PNG 文件（魔数不匹配）。`);
  }
  // IHDR 必须是第一个 chunk，且长度固定为 13。
  if (buffer.readUInt32BE(8) !== 13 || buffer.subarray(12, 16).toString('latin1') !== 'IHDR') {
    invalid(`${label}的 PNG 头缺少 IHDR。`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height) {
    invalid(`${label}的 PNG 宽高必须大于 0。`);
  }
  if (width > TIMELAPSE_MAX_FRAME_DIMENSION || height > TIMELAPSE_MAX_FRAME_DIMENSION) {
    invalid(`${label}的 PNG 尺寸超过 ${TIMELAPSE_MAX_FRAME_DIMENSION}×${TIMELAPSE_MAX_FRAME_DIMENSION} 上限。`);
  }
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const allowedDepths = ALLOWED_BIT_DEPTHS[colorType];
  if (!allowedDepths || !allowedDepths.includes(bitDepth)) {
    invalid(`${label}的 PNG bit depth / color type 组合不受支持。`);
  }
  // compression、filter 必须为 0；interlace 只能是 0/1。
  if (buffer[26] !== 0 || buffer[27] !== 0 || (buffer[28] !== 0 && buffer[28] !== 1)) {
    invalid(`${label}的 PNG IHDR 参数不受支持。`);
  }
  return { width, height, bitDepth, colorType };
}

/** PNG 头校验测试：魔数、IHDR、尺寸上限与 bit depth / color type 组合。 */

import { TimelapseArchiveError } from './errors';
import { validatePngHeader } from './png';
import { pngHeader } from './test-fixtures';

function expectFrameInvalid(buffer: Buffer): void {
  try {
    validatePngHeader(buffer);
  } catch (error) {
    expect(error).toBeInstanceOf(TimelapseArchiveError);
    expect((error as TimelapseArchiveError).code).toBe('TIMELAPSE_FRAME_INVALID');
    return;
  }
  throw new Error('期望 PNG 校验失败');
}

describe('validatePngHeader', () => {
  it('接受 1..1024 的合法 PNG 头', () => {
    expect(validatePngHeader(pngHeader({ width: 1, height: 1 }))).toMatchObject({ width: 1, height: 1, bitDepth: 8, colorType: 2 });
    expect(validatePngHeader(pngHeader({ width: 1024, height: 1024, bitDepth: 16, colorType: 6 }))).toMatchObject({ width: 1024, height: 1024 });
    expect(validatePngHeader(pngHeader({ width: 320, height: 200, bitDepth: 4, colorType: 3 })).width).toBe(320);
  });

  it('拒绝错误魔数', () => {
    expectFrameInvalid(pngHeader({ signature: Buffer.from('not-a-png') }));
  });

  it('拒绝截断文件', () => {
    expectFrameInvalid(pngHeader().subarray(0, 20));
  });

  it('拒绝非 IHDR 首块', () => {
    expectFrameInvalid(pngHeader({ ihdrType: 'IDAT' }));
    expectFrameInvalid(pngHeader({ ihdrLength: 12 }));
  });

  it('拒绝 0 或超过 1024 的尺寸', () => {
    expectFrameInvalid(pngHeader({ width: 0 }));
    expectFrameInvalid(pngHeader({ height: 0 }));
    expectFrameInvalid(pngHeader({ width: 1025 }));
    expectFrameInvalid(pngHeader({ height: 1025 }));
  });

  it('拒绝非法 bit depth / color type 组合', () => {
    expectFrameInvalid(pngHeader({ colorType: 2, bitDepth: 4 }));
    expectFrameInvalid(pngHeader({ colorType: 3, bitDepth: 16 }));
    expectFrameInvalid(pngHeader({ colorType: 9, bitDepth: 8 }));
    expectFrameInvalid(pngHeader({ colorType: 0, bitDepth: 3 }));
  });

  it('拒绝非法 IHDR 参数', () => {
    expectFrameInvalid(pngHeader({ compression: 1 }));
    expectFrameInvalid(pngHeader({ filter: 1 }));
    expectFrameInvalid(pngHeader({ interlace: 2 }));
  });
});

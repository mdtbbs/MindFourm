/** manifest.json 校验测试。 */

import { TimelapseArchiveError } from './errors';
import { parseTimelapseManifest } from './manifest';
import { TIMELAPSE_MAX_MANIFEST_BYTES } from '../../modules/timelapses/timelapse.constants';

function manifest(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(JSON.stringify({
    schema_version: 1,
    frame_count: 12,
    map_name: 'Serpulo',
    map_width: 512,
    map_height: 384,
    game_mode: 'survival',
    game_version: 'v146',
    is_multiplayer: false,
    ...overrides,
  }));
}

function expectManifestInvalid(buffer: Buffer): void {
  try {
    parseTimelapseManifest(buffer);
  } catch (error) {
    expect(error).toBeInstanceOf(TimelapseArchiveError);
    expect((error as TimelapseArchiveError).code).toBe('TIMELAPSE_MANIFEST_INVALID');
    return;
  }
  throw new Error('期望 manifest 校验失败');
}

describe('parseTimelapseManifest', () => {
  it('解析合法 manifest 并裁剪文本', () => {
    const parsed = parseTimelapseManifest(manifest({ map_name: '  Erekir  ', frames_digest_sha256: 'A'.repeat(64) }));
    expect(parsed).toMatchObject({
      schema_version: 1,
      frame_count: 12,
      map_name: 'Erekir',
      map_width: 512,
      map_height: 384,
      game_mode: 'survival',
      game_version: 'v146',
      is_multiplayer: false,
    });
    expect(parsed.frames_digest_sha256).toBe('a'.repeat(64));
  });

  it('允许省略可选尺寸/模式/版本/摘要', () => {
    const parsed = parseTimelapseManifest(manifest({
      map_width: undefined,
      map_height: null,
      game_mode: undefined,
      game_version: null,
      frames_digest_sha256: undefined,
    }));
    expect(parsed.map_width).toBeNull();
    expect(parsed.map_height).toBeNull();
    expect(parsed.game_mode).toBeNull();
    expect(parsed.game_version).toBeNull();
    expect(parsed.frames_digest_sha256).toBeNull();
  });

  it('允许 0..100000 的地图尺寸', () => {
    expect(parseTimelapseManifest(manifest({ map_width: 0, map_height: 100000 })).map_width).toBe(0);
    expectManifestInvalid(manifest({ map_width: -1 }));
    expectManifestInvalid(manifest({ map_height: 100001 }));
    expectManifestInvalid(manifest({ map_width: 1.5 }));
  });

  it('拒绝错误的 schema_version / frame_count', () => {
    expectManifestInvalid(manifest({ schema_version: 2 }));
    expectManifestInvalid(manifest({ frame_count: -1 }));
    expectManifestInvalid(manifest({ frame_count: 1.5 }));
    expectManifestInvalid(manifest({ frame_count: undefined }));
  });

  it('拒绝非法地图名', () => {
    expectManifestInvalid(manifest({ map_name: '' }));
    expectManifestInvalid(manifest({ map_name: '   ' }));
    expectManifestInvalid(manifest({ map_name: 'x'.repeat(161) }));
    expectManifestInvalid(manifest({ map_name: 'bad\nname' }));
    expectManifestInvalid(manifest({ map_name: 42 }));
  });

  it('拒绝超长 game_mode / game_version', () => {
    expectManifestInvalid(manifest({ game_mode: 'x'.repeat(41) }));
    expectManifestInvalid(manifest({ game_version: 'x'.repeat(65) }));
  });

  it('拒绝非布尔 is_multiplayer', () => {
    expectManifestInvalid(manifest({ is_multiplayer: 'false' }));
    expectManifestInvalid(manifest({ is_multiplayer: undefined }));
  });

  it('拒绝非法 frames_digest_sha256', () => {
    expectManifestInvalid(manifest({ frames_digest_sha256: 'abc' }));
    expectManifestInvalid(manifest({ frames_digest_sha256: 'g'.repeat(64) }));
  });

  it('拒绝非 JSON、非对象与超大 manifest', () => {
    expectManifestInvalid(Buffer.from('{'));
    expectManifestInvalid(Buffer.from('[]'));
    expectManifestInvalid(Buffer.alloc(TIMELAPSE_MAX_MANIFEST_BYTES + 1, 0x20));
    expectManifestInvalid(Buffer.alloc(0));
  });
});

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { TimelapseStorageService } from './timelapse-storage.service';
import { MISSING_REPORT_ID, REPORT_ID } from './timelapse-test.helpers';

/**
 * 真实 os.tmpdir 目录 + mock Settings/Config：这些用例要验证临时文件、原子
 * rename 与 range 读取的真实文件语义，不能只 mock fs。
 */
const ORIGINAL_STORAGE_ENV = process.env.TIMELAPSE_STORAGE_PATH;
let root: string;

beforeEach(async () => {
  delete process.env.TIMELAPSE_STORAGE_PATH;
  root = await mkdtemp(join(tmpdir(), 'timelapse-storage-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  if (ORIGINAL_STORAGE_ENV === undefined) delete process.env.TIMELAPSE_STORAGE_PATH;
  else process.env.TIMELAPSE_STORAGE_PATH = ORIGINAL_STORAGE_ENV;
});

function serviceFor(configured: string | null, configPath?: string) {
  const settings = {
    getCached: jest.fn((key: string) => (key === 'timelapse_storage_path' ? configured : null)),
  };
  const config = {
    get: jest.fn((key: string) => (key === 'timelapse.storagePath' ? configPath : undefined)),
  };
  return { service: new TimelapseStorageService(config as any, settings as any), settings, config };
}

function catchSync(fn: () => unknown): any {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

async function streamBytes(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const SOURCE_KEY = `source/${REPORT_ID}.zip`;
const VIDEO_KEY = `video/${REPORT_ID}.mp4`;
const POSTER_KEY = `poster/${REPORT_ID}.webp`;

describe('TimelapseStorageService 存储根目录', () => {
  it('接受绝对非根路径并报告已配置', () => {
    const { service } = serviceFor(root);
    expect(service.provider).toBe('local');
    expect(service.getStoragePath()).toBe(root);
    expect(service.isConfigured()).toBe(true);
  });

  it('拒绝相对路径、根目录与未归一化路径', () => {
    for (const invalid of ['relative/dir', '.', '/', '/tmp/', '/tmp/../tmp']) {
      const { service } = serviceFor(invalid);
      expect(catchSync(() => service.getStoragePath())).toMatchObject({ code: 'TIMELAPSE_STORAGE_UNAVAILABLE' });
      expect(service.isConfigured()).toBe(false);
    }
  });

  it('设置项为空时回落到配置项', () => {
    const { service } = serviceFor(null, root);
    expect(service.getStoragePath()).toBe(root);
  });

  it('设置项与配置项都为空时视为未配置', () => {
    const { service } = serviceFor(null);
    expect(catchSync(() => service.getStoragePath())).toMatchObject({ code: 'TIMELAPSE_STORAGE_UNAVAILABLE' });
    expect(service.isConfigured()).toBe(false);
  });

  it('probe 写入并清理探针文件；未配置时返回 false', async () => {
    const { service } = serviceFor(root);
    await expect(service.probe()).resolves.toBe(true);
    expect(await readdir(root)).toEqual([]);

    const { service: broken } = serviceFor('relative/dir');
    await expect(broken.probe()).resolves.toBe(false);
  });
});

describe('TimelapseStorageService 写入', () => {
  it('写入成功后落盘、返回 sha256/size，且目录里只留下目标文件', async () => {
    const { service } = serviceFor(root);
    const bytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('hello')]);

    const result = await service.writeStream(SOURCE_KEY, Readable.from([bytes]), { maxBytes: 1024 });

    expect(result.size).toBe(bytes.length);
    expect(result.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(await readFile(join(root, SOURCE_KEY))).toEqual(bytes);
    expect(await readdir(join(root, 'source'))).toEqual([`${REPORT_ID}.zip`]);
    await expect(service.statObject(SOURCE_KEY)).resolves.toMatchObject({ exists: true, size: bytes.length });
  });

  it('超过 maxBytes 时抛 TIMELAPSE_FILE_TOO_LARGE 并清理临时文件', async () => {
    const { service } = serviceFor(root);

    await expect(service.writeStream(SOURCE_KEY, Readable.from([Buffer.alloc(10)]), { maxBytes: 5 }))
      .rejects.toMatchObject({ code: 'TIMELAPSE_FILE_TOO_LARGE' });
    await expect(service.statObject(SOURCE_KEY)).resolves.toEqual({ exists: false });
    expect(await readdir(join(root, 'source'))).toEqual([]);
  });

  it('实际大小小于 expectedSize 时抛 TIMELAPSE_SIZE_MISMATCH', async () => {
    const { service } = serviceFor(root);

    await expect(service.writeStream(SOURCE_KEY, Readable.from([Buffer.alloc(10)]), { maxBytes: 100, expectedSize: 11 }))
      .rejects.toMatchObject({ code: 'TIMELAPSE_SIZE_MISMATCH' });
    expect(await readdir(join(root, 'source'))).toEqual([]);
  });

  it('SHA-256 与 expectedSha256 不一致时抛 TIMELAPSE_CHECKSUM_MISMATCH', async () => {
    const { service } = serviceFor(root);

    await expect(service.writeStream(SOURCE_KEY, Readable.from([Buffer.from('hello')]), {
      maxBytes: 100,
      expectedSha256: 'b'.repeat(64),
    })).rejects.toMatchObject({ code: 'TIMELAPSE_CHECKSUM_MISMATCH' });
    await expect(service.statObject(SOURCE_KEY)).resolves.toEqual({ exists: false });
  });

  it('writeBuffer 走同一条临时文件 + rename 路径', async () => {
    const { service } = serviceFor(root);

    const result = await service.writeBuffer(POSTER_KEY, Buffer.from('RIFF....WEBP'), 1024);

    expect(result.size).toBe(12);
    expect(await readFile(join(root, POSTER_KEY))).toEqual(Buffer.from('RIFF....WEBP'));
  });

  it('非法对象键在触碰磁盘前被拒绝', async () => {
    const { service } = serviceFor(root);
    const invalidKeys = [
      '../escape.zip',
      '/etc/passwd',
      `source/${REPORT_ID}.exe`,
      `poster/${REPORT_ID}.png`,
      'video/not-a-uuid.mp4',
      `source/${REPORT_ID}/../x.zip`,
    ];

    for (const key of invalidKeys) {
      await expect(service.writeStream(key, Readable.from([Buffer.from('x')]), { maxBytes: 10 }))
        .rejects.toMatchObject({ code: 'TIMELAPSE_STORAGE_UNAVAILABLE' });
      await expect(service.statObject(key)).rejects.toMatchObject({ code: 'TIMELAPSE_STORAGE_UNAVAILABLE' });
      await expect(service.openObject(key)).rejects.toMatchObject({ code: 'TIMELAPSE_STORAGE_UNAVAILABLE' });
      await expect(service.deleteObject(key)).rejects.toMatchObject({ code: 'TIMELAPSE_STORAGE_UNAVAILABLE' });
    }
    expect(await readdir(root)).toEqual([]);
  });
});

describe('TimelapseStorageService 读取与删除', () => {
  it('openObject 全量读取并返回 size/lastModified', async () => {
    const { service } = serviceFor(root);
    await service.writeStream(VIDEO_KEY, Readable.from([Buffer.from('0123456789')]), { maxBytes: 100 });

    const opened = await service.openObject(VIDEO_KEY);

    expect(opened).not.toBeNull();
    expect(opened!.size).toBe(10);
    // Node 原生 fs 返回的 Date 来自宿主 realm，Jest 沙箱里 instanceof Date 可能为 false。
    expect(opened!.lastModified.constructor.name).toBe('Date');
    expect(opened!.lastModified.getTime()).toBeGreaterThan(0);
    await expect(streamBytes(opened!.stream)).resolves.toEqual(Buffer.from('0123456789'));
  });

  it('openObject 按 Range 返回准确的字节区间', async () => {
    const { service } = serviceFor(root);
    await service.writeStream(VIDEO_KEY, Readable.from([Buffer.from('0123456789')]), { maxBytes: 100 });

    const opened = await service.openObject(VIDEO_KEY, { start: 2, end: 5 });

    expect(opened).not.toBeNull();
    await expect(streamBytes(opened!.stream)).resolves.toEqual(Buffer.from('2345'));
  });

  it('openObject 对不存在的对象返回 null', async () => {
    const { service } = serviceFor(root);
    await expect(service.openObject(`video/${MISSING_REPORT_ID}.mp4`)).resolves.toBeNull();
  });

  it('readPrefix 只返回前 N 字节，缺失对象返回空 Buffer', async () => {
    const { service } = serviceFor(root);
    const header = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    await service.writeStream(SOURCE_KEY, Readable.from([Buffer.concat([header, Buffer.from('abcdef')])]), { maxBytes: 100 });

    await expect(service.readPrefix(SOURCE_KEY, 4)).resolves.toEqual(header);
    await expect(service.readPrefix(`source/${MISSING_REPORT_ID}.zip`, 4)).resolves.toEqual(Buffer.alloc(0));
  });

  it('deleteObject 幂等：重复删除不抛错，删除后不可读', async () => {
    const { service } = serviceFor(root);
    await service.writeStream(SOURCE_KEY, Readable.from([Buffer.from('x')]), { maxBytes: 10 });

    await expect(service.deleteObject(SOURCE_KEY)).resolves.toBeUndefined();
    await expect(service.statObject(SOURCE_KEY)).resolves.toEqual({ exists: false });
    await expect(service.deleteObject(SOURCE_KEY)).resolves.toBeUndefined();
  });
});

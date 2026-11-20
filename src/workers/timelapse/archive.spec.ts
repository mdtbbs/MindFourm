/**
 * 归档解压编排测试：合法帧包、帧数/连续性、PNG 校验、manifest 一致性、
 * 帧摘要、路径穿越与 metrics 限制。
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractTimelapseArchive } from './archive';
import { TimelapseArchiveError } from './errors';
import {
  buildZip,
  manifestBuffer,
  metricLine,
  metricsJsonl,
  pngHeader,
  type ZipEntrySpec,
} from './test-fixtures';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdtl-archive-'));
  tempDirs.push(dir);
  return dir;
}

function frameEntries(
  count: number,
  make: (index: number) => Buffer = () => pngHeader({ width: 64, height: 64 }),
): ZipEntrySpec[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `frames/${String(index).padStart(4, '0')}.png`,
    data: make(index),
  }));
}

function digestOf(frames: ZipEntrySpec[]): string {
  const hash = createHash('sha256');
  for (const frame of frames) hash.update(frame.data ?? Buffer.alloc(0));
  return hash.digest('hex');
}

function defaultEntries(count = 5, manifestOverrides: Record<string, unknown> = {}): ZipEntrySpec[] {
  const frames = frameEntries(count);
  return [
    {
      name: 'manifest.json',
      method: 8,
      data: manifestBuffer({
        frame_count: count,
        frames_digest_sha256: digestOf(frames),
        ...manifestOverrides,
      }),
    },
    {
      name: 'metrics.jsonl',
      method: 8,
      data: metricsJsonl(Array.from({ length: count }, (_, index) => metricLine({ idx: index, elapsed_sec: index }))),
    },
    ...frames,
  ];
}

async function expectArchiveCode(run: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(TimelapseArchiveError);
    expect((error as TimelapseArchiveError).code).toBe(code);
    return;
  }
  throw new Error(`期望抛出 ${code}，实际没有异常`);
}

describe('extractTimelapseArchive', () => {
  it('解压合法帧包，按固定文件名落盘并校验摘要', async () => {
    const entries = defaultEntries(5, { map_name: 'Erekir' });
    const dir = await tempDir();
    const result = await extractTimelapseArchive(buildZip(entries), dir);

    expect(result.frameCount).toBe(5);
    expect(result.manifest.map_name).toBe('Erekir');
    expect(result.metrics.points).toHaveLength(5);
    expect(result.metrics.durationSeconds).toBe(4);
    expect(result.framePaths.map((item) => path.basename(item))).toEqual([
      'frame-0000.png', 'frame-0001.png', 'frame-0002.png', 'frame-0003.png', 'frame-0004.png',
    ]);
    const written = await fs.readdir(dir);
    expect(written.sort()).toEqual([
      'frame-0000.png', 'frame-0001.png', 'frame-0002.png', 'frame-0003.png', 'frame-0004.png',
    ]);
    for (let index = 0; index < 5; index += 1) {
      const expected = frameEntries(5)[index].data!;
      await expect(fs.readFile(path.join(dir, `frame-${String(index).padStart(4, '0')}.png`))).resolves.toEqual(expected);
    }
  });

  it('忽略压缩包内未知文件，不会写入磁盘', async () => {
    const dir = await tempDir();
    const entries = [
      ...defaultEntries(5),
      { name: 'notes.txt', data: Buffer.from('hello') },
    ];
    const result = await extractTimelapseArchive(buildZip(entries), dir);
    expect(result.frameCount).toBe(5);
    expect((await fs.readdir(dir)).every((name) => name.startsWith('frame-'))).toBe(true);
  });

  it('拒绝 4 帧与 181 帧', async () => {
    const dir = await tempDir();
    await expectArchiveCode(
      () => extractTimelapseArchive(buildZip(defaultEntries(4)), dir),
      'TIMELAPSE_FRAME_COUNT_INVALID',
    );
    await expectArchiveCode(
      () => extractTimelapseArchive(buildZip(defaultEntries(181)), dir),
      'TIMELAPSE_FRAME_COUNT_INVALID',
    );
  });

  it('拒绝不连续的帧序号', async () => {
    const frames = frameEntries(5);
    frames[4] = { ...frames[4], name: 'frames/0005.png' };
    const entries = [
      { name: 'manifest.json', method: 8, data: manifestBuffer({ frame_count: 5 }) },
      { name: 'metrics.jsonl', method: 8, data: metricsJsonl([metricLine()]) },
      ...frames,
    ];
    await expectArchiveCode(
      () => extractTimelapseArchive(buildZip(entries), path.join(os.tmpdir(), 'mdtl-unused')),
      'TIMELAPSE_FRAME_COUNT_INVALID',
    );
  });

  it('拒绝非 NNNN.png 的帧名', async () => {
    const frames = frameEntries(5);
    frames[2] = { ...frames[2], name: 'frames/12.png' };
    const entries = [
      { name: 'manifest.json', method: 8, data: manifestBuffer({ frame_count: 5 }) },
      { name: 'metrics.jsonl', method: 8, data: metricsJsonl([metricLine()]) },
      ...frames,
    ];
    await expectArchiveCode(
      () => extractTimelapseArchive(buildZip(entries), path.join(os.tmpdir(), 'mdtl-unused')),
      'TIMELAPSE_FRAME_INVALID',
    );
  });

  it('拒绝缺少 manifest.json / metrics.jsonl 的包', async () => {
    const dir = await tempDir();
    const withoutManifest = defaultEntries(5).filter((entry) => entry.name !== 'manifest.json');
    await expectArchiveCode(() => extractTimelapseArchive(buildZip(withoutManifest), dir), 'TIMELAPSE_ARCHIVE_INCOMPLETE');
    const withoutMetrics = defaultEntries(5).filter((entry) => entry.name !== 'metrics.jsonl');
    await expectArchiveCode(() => extractTimelapseArchive(buildZip(withoutMetrics), dir), 'TIMELAPSE_ARCHIVE_INCOMPLETE');
  });

  it('拒绝 manifest.frame_count 与实际帧数不一致', async () => {
    const dir = await tempDir();
    await expectArchiveCode(
      () => extractTimelapseArchive(buildZip(defaultEntries(5, { frame_count: 6 })), dir),
      'TIMELAPSE_FRAME_COUNT_INVALID',
    );
  });

  it('拒绝帧摘要不一致', async () => {
    const dir = await tempDir();
    await expectArchiveCode(
      () => extractTimelapseArchive(buildZip(defaultEntries(5, { frames_digest_sha256: '0'.repeat(64) })), dir),
      'TIMELAPSE_FRAMES_DIGEST_MISMATCH',
    );
  });

  it('拒绝伪造 PNG 与超过 1024 的 IHDR', async () => {
    const dir = await tempDir();
    const fakeFrames = frameEntries(5);
    fakeFrames[0] = { ...fakeFrames[0], data: Buffer.from('not a png') };
    const fakeEntries = [
      { name: 'manifest.json', method: 8, data: manifestBuffer({ frame_count: 5 }) },
      { name: 'metrics.jsonl', method: 8, data: metricsJsonl([metricLine()]) },
      ...fakeFrames,
    ];
    await expectArchiveCode(() => extractTimelapseArchive(buildZip(fakeEntries), dir), 'TIMELAPSE_FRAME_INVALID');

    const bigFrames = frameEntries(5, () => pngHeader({ width: 1025, height: 512 }));
    const bigEntries = [
      { name: 'manifest.json', method: 8, data: manifestBuffer({ frame_count: 5 }) },
      { name: 'metrics.jsonl', method: 8, data: metricsJsonl([metricLine()]) },
      ...bigFrames,
    ];
    await expectArchiveCode(() => extractTimelapseArchive(buildZip(bigEntries), dir), 'TIMELAPSE_FRAME_INVALID');
  });

  it('拒绝路径穿越条目', async () => {
    const dir = await tempDir();
    await expectArchiveCode(
      () => extractTimelapseArchive(buildZip([{ name: '../evil.png', data: Buffer.from('x') }]), dir),
      'TIMELAPSE_ZIP_UNSAFE_PATH',
    );
  });

  it('拒绝超长 metrics 行', async () => {
    const dir = await tempDir();
    const entries = defaultEntries(5);
    entries[1] = {
      name: 'metrics.jsonl',
      method: 8,
      data: Buffer.from(metricLine({ idx: 0, padding: 'x'.repeat(5000) })),
    };
    await expectArchiveCode(() => extractTimelapseArchive(buildZip(entries), dir), 'TIMELAPSE_METRICS_INVALID');
  });
});

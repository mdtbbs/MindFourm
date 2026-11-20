/**
 * ZIP 安全解析测试：使用自建 store/deflate 构造器生成最小 ZIP，
 * 覆盖合法包、路径穿越、加密/分卷/zip64、未知压缩方法、炸弹与 CRC。
 */

import { TimelapseArchiveError } from './errors';
import { buildZip, type ZipEntrySpec } from './test-fixtures';
import { extractZipEntry, findEndOfCentralDirectory, readZipEntries } from './zip';

function expectArchiveCode(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(TimelapseArchiveError);
    expect((error as TimelapseArchiveError).code).toBe(code);
    return;
  }
  throw new Error(`期望抛出 ${code}，实际没有异常`);
}

function minimalEntries(count = 5): ZipEntrySpec[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `frames/${String(index).padStart(4, '0')}.png`,
    data: Buffer.from([0x89, 0x50, 0x4e, 0x47, index]),
  }));
}

describe('zip 安全解析', () => {
  it('读取 store 与 deflate 条目，并校验 CRC 后解压', () => {
    const manifest = Buffer.from('{"schema_version":1}');
    const zip = buildZip([
      { name: 'manifest.json', data: manifest, method: 8 },
      { name: 'metrics.jsonl', data: Buffer.from('{"idx":0}\n') },
      ...minimalEntries(2),
      { name: 'frames/', data: Buffer.alloc(0), unixMode: 0o40755 },
    ]);
    const entries = readZipEntries(zip);
    expect(entries.map((entry) => entry.name)).toEqual([
      'manifest.json', 'metrics.jsonl', 'frames/0000.png', 'frames/0001.png', 'frames/',
    ]);
    expect(entries[4].isDirectory).toBe(true);
    expect(extractZipEntry(zip, entries[0])).toEqual(manifest);
    expect(extractZipEntry(zip, entries[1]).toString()).toBe('{"idx":0}\n');
  });

  it('支持带注释的 EOCD', () => {
    const zip = buildZip(minimalEntries(1), { comment: 'hello' });
    expect(findEndOfCentralDirectory(zip)).toBe(zip.length - 22 - 5);
  });

  it.each([
    ['../evil.png', '相对穿越'],
    ['/etc/passwd', '绝对路径'],
    ['C:\\evil.png', '盘符/反斜杠'],
    ['frames\\0000.png', '反斜杠'],
    ['frames/../evil.png', '中间穿越'],
    ['frames/./0000.png', '点目录'],
    ['frames//0000.png', '空段'],
    ['frames/\u0000.png', 'NUL'],
  ])('拒绝不安全路径：%s（%s）', (name) => {
    expectArchiveCode(() => readZipEntries(buildZip([{ name, data: Buffer.from('x') }])), 'TIMELAPSE_ZIP_UNSAFE_PATH');
  });

  it('拒绝符号链接', () => {
    expectArchiveCode(
      () => readZipEntries(buildZip([{ name: 'frames/0000.png', data: Buffer.from('x'), unixMode: 0o120777 }])),
      'TIMELAPSE_ZIP_SYMLINK',
    );
  });

  it('拒绝加密条目', () => {
    expectArchiveCode(
      () => readZipEntries(buildZip([{ name: 'manifest.json', data: Buffer.from('{}'), flags: 0x0001 }])),
      'TIMELAPSE_ZIP_ENCRYPTED',
    );
  });

  it('拒绝分卷 ZIP', () => {
    expectArchiveCode(() => readZipEntries(buildZip(minimalEntries(1), { disk: 1 })), 'TIMELAPSE_ZIP_UNSUPPORTED');
  });

  it('拒绝 zip64', () => {
    expectArchiveCode(() => readZipEntries(buildZip(minimalEntries(1), { zip64: true })), 'TIMELAPSE_ZIP_UNSUPPORTED');
  });

  it('拒绝未知压缩方法', () => {
    expectArchiveCode(
      () => readZipEntries(buildZip([{ name: 'manifest.json', data: Buffer.from('{}'), method: 12 as 0 }])),
      'TIMELAPSE_ZIP_UNSUPPORTED_METHOD',
    );
  });

  it('拒绝重复条目名', () => {
    expectArchiveCode(
      () => readZipEntries(buildZip([
        { name: 'manifest.json', data: Buffer.from('a') },
        { name: 'manifest.json', data: Buffer.from('b') },
      ])),
      'TIMELAPSE_ZIP_INVALID',
    );
  });

  it('拒绝解压总量超 80 MB 的炸弹', () => {
    const entries: ZipEntrySpec[] = Array.from({ length: 21 }, (_, index) => ({
      name: `frames/${String(index).padStart(4, '0')}.png`,
      data: Buffer.from('x'),
      method: 8 as const,
      uncompressedSize: 4 * 1024 * 1024,
    }));
    expectArchiveCode(() => readZipEntries(buildZip(entries)), 'TIMELAPSE_ZIP_BOMB');
  });

  it('拒绝单条超过 4 MB 的条目', () => {
    expectArchiveCode(
      () => readZipEntries(buildZip([{ name: 'frames/0000.png', data: Buffer.from('x'), method: 8, uncompressedSize: 4 * 1024 * 1024 + 1 }])),
      'TIMELAPSE_ZIP_BOMB',
    );
  });

  it('拒绝 CRC 不匹配', () => {
    const zip = buildZip([{ name: 'manifest.json', data: Buffer.from('{"a":1}'), crc: 0 }]);
    const entry = readZipEntries(zip)[0];
    expectArchiveCode(() => extractZipEntry(zip, entry), 'TIMELAPSE_ZIP_INVALID');
  });

  it('拒绝本地头与中央目录名称不一致', () => {
    const zip = buildZip([{ name: 'manifest.json', data: Buffer.from('{}'), localName: 'other.json' }]);
    const entry = readZipEntries(zip)[0];
    expectArchiveCode(() => extractZipEntry(zip, entry), 'TIMELAPSE_ZIP_INVALID');
  });

  it('实际解压数据超过声明大小时按炸弹处理', () => {
    // 构造一个声明很小、实际解压很大的 deflate 条目。
    const raw = Buffer.alloc(1024, 0x41);
    const zip = buildZip([{ name: 'manifest.json', data: raw, method: 8, uncompressedSize: 10 }]);
    const entry = readZipEntries(zip)[0];
    expectArchiveCode(() => extractZipEntry(zip, entry), 'TIMELAPSE_ZIP_BOMB');
  });
});

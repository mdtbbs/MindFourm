import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { assertSafeUploadedFile } from './upload-safety.util';

async function fixture(name: string, body: Buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mindforum-upload-'));
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, body);
  return { dir, file: { path: filePath, originalname: name, size: body.length } as any };
}

function zipWithEntry(name: string): Buffer {
  const local = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const encoded = Buffer.from(name);
  const central = Buffer.alloc(46 + encoded.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(1, 20);
  central.writeUInt32LE(1, 24);
  central.writeUInt16LE(encoded.length, 28);
  encoded.copy(central, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, end]);
}

describe('assertSafeUploadedFile', () => {
  it('rejects a spoofed image extension', async () => {
    const { dir, file } = await fixture('not-a-png.png', Buffer.from('%PDF-1.7'));
    await expect(assertSafeUploadedFile(file, 1024)).rejects.toThrow('文件内容与扩展名不匹配');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('rejects zip slip paths', async () => {
    const { dir, file } = await fixture('unsafe.zip', zipWithEntry('../secret.txt'));
    await expect(assertSafeUploadedFile(file, 1024 * 1024)).rejects.toThrow('ZIP 包含不安全路径');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('rejects oversized image dimensions before decoding the image', async () => {
    const png = Buffer.alloc(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.writeUInt32BE(20_000, 16);
    png.writeUInt32BE(20_000, 20);
    const { dir, file } = await fixture('oversized.png', png);
    await expect(assertSafeUploadedFile(file, 1024)).rejects.toThrow('图片尺寸超出安全限制');
    await fs.rm(dir, { recursive: true, force: true });
  });
});

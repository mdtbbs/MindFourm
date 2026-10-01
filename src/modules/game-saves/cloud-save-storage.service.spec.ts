import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { isCloudSaveStorageConfigured } from './cloud-save-storage-config';
import { CloudSaveStorageService } from './cloud-save-storage.service';

describe('CloudSaveStorageService', () => {
  let root: string;
  let storage: CloudSaveStorageService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mindfourm-cloud-saves-'));
    storage = new CloudSaveStorageService(
      { get: () => root } as any,
      { getCached: (key: string) => key === 'cloud_saves_storage_path' ? root : null } as any,
    );
  });

  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('accepts only absolute, normalized, non-root paths', () => {
    expect(isCloudSaveStorageConfigured(root)).toBe(true);
    expect(isCloudSaveStorageConfigured('relative/cloud-saves')).toBe(false);
    expect(isCloudSaveStorageConfigured('/')).toBe(false);
    expect(isCloudSaveStorageConfigured(`${root}/../elsewhere`)).toBe(false);
  });

  it('writes files under opaque per-user object keys and verifies exact size and checksum', async () => {
    const objectKey = `cloud-saves/42/${randomUUID()}`;
    const bytes = Buffer.from('verified save bytes');
    const checksum = createHash('sha256').update(bytes).digest('hex');
    await storage.writeObject(objectKey, Readable.from(bytes), bytes.length, checksum, 1024);

    expect(await storage.statObject(objectKey)).toEqual({ exists: true, size_bytes: bytes.length });
    expect(await storage.verifyObject(objectKey, bytes.length, checksum, 1024)).toBe(true);
    expect(await readFile(join(root, objectKey))).toEqual(bytes);
    expect(await storage.verifyObject(objectKey, bytes.length - 1, checksum, 1024)).toBe(false);
  });

  it('rejects oversize and checksum-mismatched uploads without leaving partial files', async () => {
    const tooLargeKey = `cloud-saves/42/${randomUUID()}`;
    const bytes = Buffer.from('too large');
    await expect(storage.writeObject(tooLargeKey, Readable.from(bytes), 2, '0'.repeat(64), 2))
      .rejects.toMatchObject({ code: 'SAVE_FILE_TOO_LARGE' });
    expect((await storage.statObject(tooLargeKey)).exists).toBe(false);

    const mismatchKey = `cloud-saves/42/${randomUUID()}`;
    await expect(storage.writeObject(mismatchKey, Readable.from(bytes), bytes.length, '0'.repeat(64), 1024))
      .rejects.toMatchObject({ code: 'SAVE_UPLOAD_CHECKSUM_MISMATCH' });
    expect((await storage.statObject(mismatchKey)).exists).toBe(false);
  });

  it('rejects path traversal and deletes local objects idempotently', async () => {
    await expect(storage.statObject('../other-user/object')).rejects.toMatchObject({ code: 'SAVE_STORAGE_UNAVAILABLE' });
    const objectKey = `cloud-saves/42/${randomUUID()}`;
    await storage.deleteObject(objectKey);
  });
});

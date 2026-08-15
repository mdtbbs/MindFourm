import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ResourceStorageService } from './resource-storage.service';

describe('ResourceStorageService', () => {
  const previousRoot = process.env.RESOURCE_UPLOAD_ROOT;

  afterEach(() => {
    if (previousRoot === undefined) delete process.env.RESOURCE_UPLOAD_ROOT;
    else process.env.RESOURCE_UPLOAD_ROOT = previousRoot;
  });

  it('keeps incoming payloads quarantined until explicit promotion', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-storage-'));
    process.env.RESOURCE_UPLOAD_ROOT = root;
    const service = new ResourceStorageService({ get: jest.fn().mockResolvedValue('resources') } as any);
    const incoming = path.join(root, 'incoming.zip');
    await fs.writeFile(incoming, 'content');
    const stored = await service.storeIncoming({ path: incoming, filename: 'stored.zip', originalname: 'original.zip', size: 7, mimetype: 'application/zip' } as any);

    expect(stored!.file_path).toContain(`${path.sep}.quarantine${path.sep}resources${path.sep}`);
    await expect(fs.access(stored!.file_path)).resolves.toBeUndefined();
    const promoted = await service.promote(stored!.file_path);
    expect(promoted).toBe(path.join(root, 'resources', 'stored.zip'));
    await expect(fs.access(promoted!)).resolves.toBeUndefined();
    await expect(fs.access(stored!.file_path)).rejects.toThrow();
    await fs.rm(root, { recursive: true, force: true });
  });
});

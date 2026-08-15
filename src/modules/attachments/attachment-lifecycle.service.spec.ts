import { AttachmentLifecycleService } from './attachment-lifecycle.service';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('AttachmentLifecycleService', () => {
  const originalCwd = process.cwd();
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mindforum-attachment-'));
    process.chdir(tempRoot);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('removes only expired files from the attachment quarantine', async () => {
    const quarantine = path.join(tempRoot, 'uploads/.quarantine/attachments');
    await fs.mkdir(quarantine, { recursive: true });
    const target = path.join(quarantine, 'old.bin');
    await fs.writeFile(target, 'retired');
    const repo = { find: jest.fn().mockResolvedValue([{ id: 7, file_path: target }]), remove: jest.fn().mockResolvedValue(undefined) };
    const service = new AttachmentLifecycleService(repo as any, { getNumber: jest.fn().mockResolvedValue(30) } as any, {} as any);

    await expect(service.cleanup(new Date('2026-08-15T00:00:00Z'))).resolves.toBe(1);
    await expect(fs.access(target)).rejects.toThrow();
    expect(repo.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it('does not remove a path outside the quarantine even when the record is expired', async () => {
    const target = path.join(tempRoot, 'outside.bin');
    await fs.writeFile(target, 'keep');
    const repo = { find: jest.fn().mockResolvedValue([{ id: 8, file_path: target }]), remove: jest.fn() };
    const service = new AttachmentLifecycleService(repo as any, { getNumber: jest.fn().mockResolvedValue(30) } as any, {} as any);

    await expect(service.cleanup()).resolves.toBe(0);
    await expect(fs.readFile(target, 'utf8')).resolves.toBe('keep');
    expect(repo.remove).not.toHaveBeenCalled();
  });
});

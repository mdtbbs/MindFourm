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
    expect(stored!.content_hash).toBe('ed7002b439e9ac845f22357d822bac1444730fbdb6016d3ec9432297b9ec9f73');
    await expect(fs.access(stored!.file_path)).resolves.toBeUndefined();
    const promoted = await service.promote(stored!.file_path);
    expect(promoted).toBe(path.join(root, 'resources', 'stored.zip'));
    await expect(fs.access(promoted!)).resolves.toBeUndefined();
    await expect(fs.access(stored!.file_path)).rejects.toThrow();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('repairs a multipart filename decoded as Latin-1 before persistence', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-storage-'));
    process.env.RESOURCE_UPLOAD_ROOT = root;
    const service = new ResourceStorageService({ get: jest.fn().mockResolvedValue('resources') } as any);
    const incoming = path.join(root, 'incoming.msch');
    await fs.writeFile(incoming, 'content');

    const mojibake = Buffer.from('(双科).msch', 'utf8').toString('latin1');
    const stored = await service.storeIncoming({
      path: incoming,
      filename: 'stored.msch',
      originalname: mojibake,
      size: 7,
      mimetype: 'application/octet-stream',
    } as any);

    expect(stored!.file_name).toBe('(双科).msch');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('treats an already-promoted file as a successful retry', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-storage-'));
    process.env.RESOURCE_UPLOAD_ROOT = root;
    const service = new ResourceStorageService({ get: jest.fn().mockResolvedValue('resources') } as any);
    const quarantine = path.join(root, '.quarantine', 'resources');
    const resources = path.join(root, 'resources');
    await fs.mkdir(quarantine, { recursive: true });
    await fs.mkdir(resources, { recursive: true });
    const promotedPath = path.join(resources, 'retry.zip');
    await fs.writeFile(promotedPath, 'content');

    await expect(service.promote(path.join(quarantine, 'retry.zip'))).resolves.toBe(promotedPath);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('prepares publication by copying and leaves the quarantine source for post-commit cleanup', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-storage-'));
    process.env.RESOURCE_UPLOAD_ROOT = root;
    const service = new ResourceStorageService({ get: jest.fn().mockResolvedValue('resources') } as any);
    const quarantine = path.join(root, '.quarantine', 'resources');
    const sourcePath = path.join(quarantine, 'prepared.zip');
    await fs.mkdir(quarantine, { recursive: true });
    await fs.writeFile(sourcePath, 'content');

    const prepared = await service.preparePromotion(sourcePath);

    expect(prepared).toEqual({
      sourcePath,
      targetPath: path.join(root, 'resources', 'prepared.zip'),
      createdTarget: true,
    });
    await expect(fs.readFile(sourcePath, 'utf8')).resolves.toBe('content');
    await expect(fs.readFile(prepared.targetPath, 'utf8')).resolves.toBe('content');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('reuses an identical existing target without replacing it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-storage-'));
    process.env.RESOURCE_UPLOAD_ROOT = root;
    const service = new ResourceStorageService({ get: jest.fn().mockResolvedValue('resources') } as any);
    const quarantine = path.join(root, '.quarantine', 'resources');
    const resources = path.join(root, 'resources');
    const sourcePath = path.join(quarantine, 'retry.zip');
    const targetPath = path.join(resources, 'retry.zip');
    await fs.mkdir(quarantine, { recursive: true });
    await fs.mkdir(resources, { recursive: true });
    await fs.writeFile(sourcePath, 'same payload');
    await fs.writeFile(targetPath, 'same payload');

    await expect(service.preparePromotion(sourcePath)).resolves.toEqual({
      sourcePath,
      targetPath,
      createdTarget: false,
    });
    await expect(fs.readFile(sourcePath, 'utf8')).resolves.toBe('same payload');
    await expect(fs.readFile(targetPath, 'utf8')).resolves.toBe('same payload');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('rejects a same-name target with different content without overwriting it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-storage-'));
    process.env.RESOURCE_UPLOAD_ROOT = root;
    const service = new ResourceStorageService({ get: jest.fn().mockResolvedValue('resources') } as any);
    const quarantine = path.join(root, '.quarantine', 'resources');
    const resources = path.join(root, 'resources');
    const sourcePath = path.join(quarantine, 'collision.zip');
    const targetPath = path.join(resources, 'collision.zip');
    await fs.mkdir(quarantine, { recursive: true });
    await fs.mkdir(resources, { recursive: true });
    await fs.writeFile(sourcePath, 'new payload');
    await fs.writeFile(targetPath, 'existing payload');

    await expect(service.preparePromotion(sourcePath)).rejects.toThrow('已存在不同内容的同名文件');
    await expect(fs.readFile(sourcePath, 'utf8')).resolves.toBe('new payload');
    await expect(fs.readFile(targetPath, 'utf8')).resolves.toBe('existing payload');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('turns a pasted Mindustry schematic into a quarantined managed file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-storage-'));
    process.env.RESOURCE_UPLOAD_ROOT = root;
    const service = new ResourceStorageService({ get: jest.fn().mockResolvedValue('resources') } as any);
    const raw = Buffer.concat([Buffer.from('msch\x01', 'binary'), Buffer.from('fixture')]);

    const stored = await service.storePastedSchematic(raw.toString('base64'));

    expect(stored.file_name).toMatch(/^pasted-schematic-.*\.msch$/);
    expect(stored.file_path).toContain(`${path.sep}.quarantine${path.sep}resources${path.sep}`);
    await expect(fs.readFile(stored.file_path)).resolves.toEqual(raw);
    await fs.rm(root, { recursive: true, force: true });
  });

  it('rejects pasted data that is not a Mindustry schematic', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-storage-'));
    process.env.RESOURCE_UPLOAD_ROOT = root;
    const service = new ResourceStorageService({ get: jest.fn().mockResolvedValue('resources') } as any);

    await expect(service.storePastedSchematic(Buffer.from('not a schematic').toString('base64')))
      .rejects.toThrow('不是有效的 Mindustry .msch 文件');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('limits private evidence access and deletion to quarantine storage', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mindfourm-storage-'));
    process.env.RESOURCE_UPLOAD_ROOT = root;
    const service = new ResourceStorageService({ get: jest.fn().mockResolvedValue('resources') } as any);
    const quarantinePath = path.join(root, '.quarantine', 'resources', 'report.log');
    const publicPath = path.join(root, 'resources', 'public.zip');
    await fs.mkdir(path.dirname(quarantinePath), { recursive: true });
    await fs.mkdir(path.dirname(publicPath), { recursive: true });
    await fs.writeFile(quarantinePath, 'private evidence');
    await fs.writeFile(publicPath, 'public resource');

    await expect(service.readQuarantinedFile(quarantinePath, 1024)).resolves.toEqual(Buffer.from('private evidence'));
    await expect(service.readQuarantinedFile(publicPath, 1024)).rejects.toThrow('私有附件存储路径无效');
    await expect(service.removeQuarantinedFile(publicPath)).resolves.toBe(false);
    await expect(fs.readFile(publicPath, 'utf8')).resolves.toBe('public resource');
    await expect(service.removeQuarantinedFile(quarantinePath)).resolves.toBe(true);
    await expect(fs.access(quarantinePath)).rejects.toThrow();

    await fs.rm(root, { recursive: true, force: true });
  });
});

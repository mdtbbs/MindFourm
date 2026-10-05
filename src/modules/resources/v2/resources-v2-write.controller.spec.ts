import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResourcesV2WriteController } from './resources-v2-write.controller';

describe('ResourcesV2WriteController invitation response validation', () => {
  function controller() {
    const resources = { respondToInvitation: jest.fn().mockResolvedValue({ accepted: true }) };
    return { controller: new ResourcesV2WriteController(resources as any, {} as any), resources };
  }

  it.each([
    ['accept true', { accept: true }, true],
    ['accept false', { accept: false }, false],
  ])('passes %s through as a real JSON boolean', async (_label, body, expected) => {
    const { controller: instance, resources } = controller();

    await instance.respondToInvitation('10000000-0000-4000-8000-000000000001', body as any, { user: { id: 7 } });

    expect(resources.respondToInvitation).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001', expected, 7,
    );
  });

  it.each([
    ['string false', { accept: 'false' }],
    ['string true', { accept: 'true' }],
    ['number one', { accept: 1 }],
    ['number zero', { accept: 0 }],
    ['missing accept', {}],
    ['missing body', undefined],
  ])('rejects %s with 400', async (_label, body) => {
    const { controller: instance, resources } = controller();

    await expect(instance.respondToInvitation(
      '10000000-0000-4000-8000-000000000001', body as any, { user: { id: 7 } },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(resources.respondToInvitation).not.toHaveBeenCalled();
  });
});


describe('ResourcesV2WriteController RES version upload', () => {
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'resource-v2-res-')); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  async function setup() {
    const filePath = join(directory, 'map.msav');
    await writeFile(filePath, Buffer.from('MSAVfixture'));
    const incoming = { path: filePath, originalname: 'map.msav', size: 11 } as Express.Multer.File;
    const stored = { file_path: filePath, file_name: 'map.msav', file_size: 11, content_hash: 'a'.repeat(64), mime_type: 'application/octet-stream' };
    const remote = { ...stored, storage_backend: 'res', provider_object_id: 'res-public' };
    const storage = { storeIncoming: jest.fn().mockResolvedValue(stored), removeManaged: jest.fn().mockResolvedValue(true) };
    const resources = { createVersion: jest.fn().mockResolvedValue({ revision: 2 }) };
    const uploads = { uploadManagedFile: jest.fn().mockResolvedValue(remote) };
    const controller = new ResourcesV2WriteController(resources as any, storage as any, uploads as any);
    return { controller, incoming, stored, remote, storage, resources, uploads };
  }

  it('persists RES references while preserving the temporary path for static analysis, then removes the local copy', async () => {
    const { controller, incoming, stored, remote, storage, resources, uploads } = await setup();
    await expect(controller.createVersion('resource-public', { version: '1.0.0' }, incoming, { user: { id: 7 } })).resolves.toEqual({ revision: 2 });
    expect(uploads.uploadManagedFile).toHaveBeenCalledWith(stored);
    expect(resources.createVersion).toHaveBeenCalledWith('resource-public', remote, expect.objectContaining({ version: '1.0.0' }), 7);
    expect(storage.removeManaged).toHaveBeenCalledWith(stored.file_path);
  });

  it('fails an unavailable RES upload without creating a managed version', async () => {
    const { controller, incoming, stored, storage, resources, uploads } = await setup();
    uploads.uploadManagedFile.mockRejectedValue(new ServiceUnavailableException('资源存储服务暂不可用'));
    await expect(controller.createVersion('resource-public', { version: '1.0.0' }, incoming, { user: { id: 7 } })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(resources.createVersion).not.toHaveBeenCalled();
    expect(storage.removeManaged).toHaveBeenCalledWith(stored.file_path);
  });
});

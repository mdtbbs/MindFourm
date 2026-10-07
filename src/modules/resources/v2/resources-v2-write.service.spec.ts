import { DataSource } from 'typeorm';
import { ResourcesV2WriteService } from './resources-v2-write.service';

describe('ResourcesV2WriteService resource relations', () => {
  function createService() {
    const service = new ResourcesV2WriteService({} as DataSource, {} as any, {} as any, {} as any, {} as any);
    jest.spyOn(service as any, 'assertRole').mockResolvedValue('owner');
    return service;
  }

  it('requires fork and successor relations to point to the same resource type and a specific target version', async () => {
    const service = createService();
    const source = { id: 10, resource_kind: 'schematic' };
    const target = { id: 11, resource_kind: 'schematic', is_public: 1, status: 'approved' };
    jest.spyOn(service as any, 'getResource').mockResolvedValueOnce(source).mockResolvedValueOnce(target);

    await expect(service.createRelation('4ab5d671-8af6-4d16-8238-7b6fd4b0a240', {
      target_resource_public_id: '84b37577-d086-4897-a866-658e29e0bd09', relation_type: 'fork_of',
    }, 1)).rejects.toThrow('必须指定目标版本');
  });

  it('rejects cross-kind fork links', async () => {
    const service = createService();
    (service as any).dataSource.transaction = (callback: (manager: { query: jest.Mock }) => unknown) =>
      callback({ query: jest.fn().mockResolvedValue([{ id: 10, resource_kind: 'schematic' }]) });
    jest.spyOn(service as any, 'getResource')
      .mockResolvedValueOnce({ id: 10, resource_kind: 'schematic' })
      .mockResolvedValueOnce({ id: 11, resource_kind: 'map', is_public: 1, status: 'approved' });

    await expect(service.createRelation('4ab5d671-8af6-4d16-8238-7b6fd4b0a240', {
      target_resource_public_id: '84b37577-d086-4897-a866-658e29e0bd09', relation_type: 'successor_of',
      target_version_public_id: '16d81bd0-90c7-48ed-a371-a81059aaddc9',
    }, 1)).rejects.toThrow('必须连接相同类型的资源');
  });

  it('rejects arbitrary relation values outside the documented V2 relation contract', async () => {
    const service = createService();
    jest.spyOn(service as any, 'getResource')
      .mockResolvedValueOnce({ id: 10, resource_kind: 'mod' })
      .mockResolvedValueOnce({ id: 11, resource_kind: 'mod', is_public: 1, status: 'approved' });

    await expect(service.createRelation('4ab5d671-8af6-4d16-8238-7b6fd4b0a240', {
      target_resource_public_id: '84b37577-d086-4897-a866-658e29e0bd09', relation_type: 'inject_sql',
    }, 1)).rejects.toThrow('关联类型无效');
  });
});

describe('ResourcesV2WriteService schematic export storage', () => {
  const publicId = '11111111-1111-4111-8111-111111111111';
  const versionId = '22222222-2222-4222-8222-222222222222';
  const operations = { rotation_quarters: 1, mirror_x: false, delete_positions: [], move_positions: [], add_blocks: [], logic_configs: [], config_edits: [] };
  function setup(primary: any) {
    const bytes = Buffer.from('msch-original');
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ id: 8, public_id: versionId, status: 'published', file_name: 'original.msch', file_path: primary ? null : '/uploads/resources/original.msch', content_hash: null }]),
      getRepository: jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(primary) }),
    };
    const previews = { transformSchematic: jest.fn().mockResolvedValue({ data: Buffer.from('msch-edited'), sha256: 'a'.repeat(64) }) };
    const storage = { readManagedFile: jest.fn().mockResolvedValue(bytes) };
    const provider = { getReadableContent: jest.fn().mockResolvedValue(bytes) };
    const service = new ResourcesV2WriteService(dataSource as any, {} as any, {} as any, {} as any, previews as any, storage as any, provider as any);
    jest.spyOn(service as any, 'getResource').mockResolvedValue({ id: 1, resource_kind: 'schematic' });
    jest.spyOn(service as any, 'assertRole').mockResolvedValue('owner');
    return { service, provider, storage, previews, bytes };
  }

  it('reads an RES primary file through the authenticated provider and never needs a local path', async () => {
    const primary = { id: 9, storage_backend: 'res', provider_object_id: 'res-public', original_filename: 'original.msch', content_hash: null };
    const { service, provider, storage, previews, bytes } = setup(primary);
    const result = await service.exportSchematic(publicId, versionId, operations, 5);
    expect(provider.getReadableContent).toHaveBeenCalledWith(primary, 20 * 1024 * 1024);
    expect(storage.readManagedFile).not.toHaveBeenCalled();
    expect(previews.transformSchematic).toHaveBeenCalledWith('original.msch', bytes, operations);
    expect(result.file_name).toBe('original-edited.msch');
  });

  it('preserves historical versions without a ResourceFile record', async () => {
    const { service, provider, storage } = setup(null);
    await service.exportSchematic(publicId, versionId, operations, 5);
    expect(provider.getReadableContent).not.toHaveBeenCalled();
    expect(storage.readManagedFile).toHaveBeenCalledWith('/uploads/resources/original.msch', 20 * 1024 * 1024);
  });

  it('rejects corrupted RES bytes before transformation', async () => {
    const { service, previews } = setup({ storage_backend: 'res', original_filename: 'original.msch', content_hash: 'b'.repeat(64) });
    await expect(service.exportSchematic(publicId, versionId, operations, 5)).rejects.toThrow('蓝图源文件校验失败');
    expect(previews.transformSchematic).not.toHaveBeenCalled();
  });
});


describe('ResourcesV2WriteService critical profile storage visibility', () => {
  function setup() {
    const resource = { id: 7, public_id: '11111111-1111-4111-8111-111111111111', user_id: 10,
      status: 'approved', is_public: 1, visibility: 'public', license: 'MIT', source_url: null };
    const manager = { query: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}),
      save: jest.fn().mockResolvedValue({}), create: jest.fn((_entity, value) => value) };
    const dataSource = { transaction: jest.fn(async (callback) => callback(manager)) };
    const resources = { findOne: jest.fn().mockResolvedValue({ ...resource, status: 'pending', license: 'GPL-3.0' }) };
    const lifecycle = { setResourceStorageVisibility: jest.fn().mockResolvedValue(undefined) };
    const service = new ResourcesV2WriteService(dataSource as any, resources as any, {} as any, {} as any, {} as any,
      undefined, undefined, lifecycle as any);
    jest.spyOn(service as any, 'lockResource').mockResolvedValue(resource);
    jest.spyOn(service as any, 'assertRole').mockResolvedValue('owner');
    return { service, manager, resource, lifecycle };
  }

  it('makes files and previews private before downgrading a published profile', async () => {
    const harness = setup();
    await harness.service.updateProfile(harness.resource.public_id, { license: 'GPL-3.0' }, 10);
    expect(harness.lifecycle.setResourceStorageVisibility).toHaveBeenCalledWith(harness.resource, 'private', harness.manager);
    expect(harness.manager.update).toHaveBeenCalledWith(expect.anything(), 7, expect.objectContaining({ status: 'pending' }));
    expect(harness.lifecycle.setResourceStorageVisibility.mock.invocationCallOrder[0])
      .toBeLessThan(harness.manager.update.mock.invocationCallOrder[0]);
  });

  it('restores original public visibility after a database failure', async () => {
    const harness = setup();
    harness.manager.save.mockRejectedValueOnce(new Error('event insert failed'));
    await expect(harness.service.updateProfile(harness.resource.public_id, { license: 'GPL-3.0' }, 10)).rejects.toThrow('event insert failed');
    expect(harness.lifecycle.setResourceStorageVisibility).toHaveBeenNthCalledWith(1, harness.resource, 'private', harness.manager);
    expect(harness.lifecycle.setResourceStorageVisibility).toHaveBeenLastCalledWith(harness.resource, 'public');
  });
});

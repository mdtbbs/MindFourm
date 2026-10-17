import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { ResourcesV2WriteService } from './resources-v2-write.service';

describe('ResourcesV2WriteService schematic export', () => {
  const resourceId = '4ab5d671-8af6-4d16-8238-7b6fd4b0a240';
  const versionId = '84b37577-d086-4897-a866-658e29e0bd09';
  const source = Buffer.from([0x6d, 0x73, 0x63, 0x68, 1, 2, 3]);
  const edited = Buffer.from([0x6d, 0x73, 0x63, 0x68, 1, 4, 5]);

  function createService(status = 'published', contentHash = createHash('sha256').update(source).digest('hex')) {
    const dataSource = { query: jest.fn().mockResolvedValue([{
      id: 8, public_id: versionId, status, file_path: '/managed/resources/source.msch', file_name: '../source.msch', content_hash: contentHash,
    }]), getRepository: jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) }) };
    const resources = { findOne: jest.fn().mockResolvedValue({ id: 7, user_id: 11, resource_kind: 'schematic' }) };
    const storage = { readManagedFile: jest.fn().mockResolvedValue(source) };
    const previews = { transformSchematic: jest.fn().mockResolvedValue({ data: edited, sha256: createHash('sha256').update(edited).digest('hex') }) };
    const service = new ResourcesV2WriteService(dataSource as unknown as DataSource, resources as any, {} as any, {} as any, previews as any, storage as any);
    const roleCheck = jest.spyOn(service as any, 'assertRole').mockResolvedValue('owner');
    return { service, dataSource, resources, storage, previews, roleCheck };
  }

  it('limits export to managed published schematic versions and returns a new filename without replacing the source', async () => {
    const { service, dataSource, storage, previews, roleCheck } = createService();

    await expect(service.exportSchematic(resourceId, versionId, {
      rotation_quarters: 1, mirror_x: true, delete_positions: [{ x: 1, y: 2 }],
    }, 11)).resolves.toEqual({
      data: edited,
      file_name: 'source-edited.msch',
      sha256: createHash('sha256').update(edited).digest('hex'),
    });
    expect(roleCheck).toHaveBeenCalledWith(expect.objectContaining({ resource_kind: 'schematic' }), 11, ['owner', 'maintainer']);
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('status'), [7, versionId]);
    expect(storage.readManagedFile).toHaveBeenCalledWith('/managed/resources/source.msch', 20 * 1024 * 1024);
    expect(previews.transformSchematic).toHaveBeenCalledWith('../source.msch', source, {
      rotation_quarters: 1, mirror_x: true, delete_positions: [{ x: 1, y: 2 }],
      move_positions: [], add_blocks: [], logic_configs: [], config_edits: [],
    });
    expect(source.subarray(0, 5)).toEqual(Buffer.from([0x6d, 0x73, 0x63, 0x68, 1]));
  });

  it('rejects draft versions and source hash mismatches before invoking the renderer', async () => {
    const draft = createService('draft');
    await expect(draft.service.exportSchematic(resourceId, versionId, {
      rotation_quarters: 0, mirror_x: false, delete_positions: [],
    }, 11)).rejects.toThrow('已发布蓝图版本不存在');
    expect(draft.previews.transformSchematic).not.toHaveBeenCalled();

    const mismatched = createService('published', '0'.repeat(64));
    await expect(mismatched.service.exportSchematic(resourceId, versionId, {
      rotation_quarters: 0, mirror_x: false, delete_positions: [],
    }, 11)).rejects.toThrow('蓝图源文件校验失败');
    expect(mismatched.previews.transformSchematic).not.toHaveBeenCalled();
  });

  it('requires owner or maintainer authorization before reading the managed source file', async () => {
    const { service, storage, roleCheck } = createService();
    roleCheck.mockRejectedValue(new Error('permission denied'));

    await expect(service.exportSchematic(resourceId, versionId, {
      rotation_quarters: 0, mirror_x: false, delete_positions: [],
    }, 12)).rejects.toThrow('permission denied');
    expect(storage.readManagedFile).not.toHaveBeenCalled();
  });
});

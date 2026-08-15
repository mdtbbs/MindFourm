import { ResourceLifecycleService } from './resource-lifecycle.service';

describe('ResourceLifecycleService', () => {
  it('purges only retained rejected/deleted files and preserves active references', async () => {
    const resourceRepository = {
      createQueryBuilder: jest.fn(() => ({ withDeleted: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([
        { id: 1, file_path: '/uploads/.quarantine/resources/rejected.zip', status: 'rejected', updated_at: new Date('2026-01-01'), deleted_at: null },
        { id: 2, file_path: '/uploads/.quarantine/resources/pending.zip', status: 'pending', updated_at: new Date('2026-01-01'), deleted_at: null },
      ]) })),
      update: jest.fn(),
    };
    const versionRepository = { find: jest.fn().mockResolvedValue([
      { id: 11, resource_id: 1, file_path: '/uploads/.quarantine/resources/rejected-v.zip' },
      { id: 12, resource_id: 2, file_path: '/uploads/.quarantine/resources/pending-v.zip' },
    ]), update: jest.fn() };
    const storage = { removeManaged: jest.fn().mockResolvedValue(true), cleanupOrphanedQuarantine: jest.fn().mockResolvedValue(2) };
    const service = new ResourceLifecycleService(resourceRepository as any, versionRepository as any, storage as any, { getNumber: jest.fn().mockResolvedValue(30) } as any, {} as any);

    const result = await service.cleanup(new Date('2026-02-15'));
    expect(result).toEqual({ quarantined_orphans: 2, retired_resource_files: 1, retired_version_files: 1 });
    expect(storage.removeManaged).toHaveBeenCalledWith('/uploads/.quarantine/resources/rejected.zip');
    expect(storage.removeManaged).not.toHaveBeenCalledWith('/uploads/.quarantine/resources/pending.zip');
    expect(resourceRepository.update).toHaveBeenCalledWith(1, { file_path: '' });
    expect(versionRepository.update).toHaveBeenCalledWith(11, { file_path: '' });
  });
});

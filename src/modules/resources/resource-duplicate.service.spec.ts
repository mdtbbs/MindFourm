import { RESOURCE_DUPLICATE_STATUSES, ResourceDuplicateService } from './resource-duplicate.service';

describe('ResourceDuplicateService', () => {
  it('treats pending exact hashes as hard duplicates but reveals only public resource details', async () => {
    const find = jest.fn().mockResolvedValue([{
      id: 12, public_id: 'private-pending', title: 'Secret title', status: 'pending', is_public: 0,
      content_hash: 'a'.repeat(64), deleted_at: null, merged_into_resource_id: null,
    }]);
    const service = new ResourceDuplicateService({ find } as any);

    const result = await service.inspect({ contentHash: 'a'.repeat(64) });

    expect(result.exact).toBe(true);
    expect(result.existing_resources).toEqual([{
      id: null, public_id: null, title: '已有资源正在审核或不可见', status: 'pending', url: '/resources',
    }]);
    expect(find.mock.calls[0][0].where.status.value).toEqual(RESOURCE_DUPLICATE_STATUSES);
    expect(find.mock.calls[0][0].select).toContain('deleted_at');
  });

  it('keeps pending_review blocking while rejected and withdrawn are no longer active duplicate states', () => {
    expect(RESOURCE_DUPLICATE_STATUSES).toContain('pending_review');
    expect(RESOURCE_DUPLICATE_STATUSES).not.toContain('rejected');
    expect(RESOURCE_DUPLICATE_STATUSES).not.toContain('withdrawn');
  });

  it('redacts approved matches from inactive topics because they are not publicly visible', async () => {
    const find = jest.fn().mockResolvedValue([{
      id: 13, public_id: 'hidden-topic-id', title: 'Hidden topic title', status: 'published', is_public: 1,
      content_hash: 'd'.repeat(64), category_id: 4, category: { id: 4, is_active: 0 },
      deleted_at: null, merged_into_resource_id: null,
    }]);
    const service = new ResourceDuplicateService({ find } as any);

    await expect(service.inspect({ contentHash: 'd'.repeat(64) })).resolves.toMatchObject({
      exact: true,
      existing_resources: [{ id: null, public_id: null, title: '已有资源正在审核或不可见' }],
    });
  });

  it('distinguishes exact structure from rotation and mirror similarity', async () => {
    const find = jest.fn().mockResolvedValue([{
      id: 24, public_id: 'public-blueprint', title: 'Factory', status: 'approved', is_public: 1,
      structure_hash: 'b'.repeat(64), normalized_structure_hash: 'c'.repeat(64),
      deleted_at: null, merged_into_resource_id: null,
    }]);
    const service = new ResourceDuplicateService({ find } as any);

    const result = await service.inspect({ structureHash: 'b'.repeat(64), normalizedStructureHash: 'c'.repeat(64) });

    expect(result).toMatchObject({ exact: false, structure: true, normalized: true });
    expect(result.existing_resources).toEqual([{
      id: 24, public_id: 'public-blueprint', title: 'Factory', status: 'approved', url: '/resources/24',
    }]);
  });

  it('offers title or source matches for Mods without treating them as hard duplicates', async () => {
    const query = {
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 39, public_id: 'mod-public', title: 'Example Mod', status: 'published', is_public: 1 }]),
    };
    const service = new ResourceDuplicateService({ find: jest.fn(), createQueryBuilder: jest.fn(() => query) } as any);

    const result = await service.inspect({ resourceKind: 'mod', title: 'Example Mod' });

    expect(result.exact).toBe(false);
    expect(result.similar_resources?.[0]).toMatchObject({ id: 39, title: 'Example Mod', url: '/resources/39' });
    expect(query.andWhere).toHaveBeenCalledWith('resource.title = :title', { title: 'Example Mod' });
  });

  it('finds exact file hashes on active resource versions', async () => {
    const versionQuery = {
      innerJoinAndSelect: jest.fn().mockReturnThis(), leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ resource: {
        id: 41, public_id: 'version-owner', title: 'Version owner', status: 'published', is_public: 1,
        category_id: null, category: null,
      } }]),
    };
    const service = new ResourceDuplicateService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { createQueryBuilder: jest.fn(() => versionQuery) } as any,
    );

    const result = await service.inspect({ contentHash: 'e'.repeat(64) });

    expect(result).toMatchObject({
      exact: true,
      existing_resources: [{ id: 41, public_id: 'version-owner', title: 'Version owner', url: '/resources/41' }],
    });
    expect(versionQuery.andWhere).toHaveBeenCalledWith('(version.status IS NULL OR version.status IN (:...versionStatuses))', {
      versionStatuses: ['pending', 'pending_review', 'published'],
    });
  });
});

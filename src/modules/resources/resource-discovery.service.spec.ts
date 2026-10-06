import { ResourceDiscoveryService } from './resource-discovery.service';

function query<T>(result: T) {
  const builder: any = {
    leftJoinAndSelect: jest.fn(() => builder),
    where: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    take: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    addOrderBy: jest.fn(() => builder),
    getOne: jest.fn(),
    getMany: jest.fn(),
  };
  if (Array.isArray(result)) builder.getMany.mockResolvedValue(result);
  else builder.getOne.mockResolvedValue(result);
  return builder;
}

function resource(overrides: Record<string, unknown>) {
  return {
    id: 1,
    public_id: 'source',
    title: 'Source',
    status: 'approved',
    is_public: 1,
    visibility: 'public',
    resource_kind: 'schematic',
    category_id: 10,
    metadata_json: { tags: ['logic', 'power'] },
    view_count: '10',
    download_count: 2,
    rating_count: 1,
    rating_average: 4,
    rating_sum: 4,
    is_featured: 0,
    file_size: 0,
    use_mfl: 0,
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
    user: null,
    category: null,
    ...overrides,
  } as any;
}

function service(resourceRepository: any, likes: any = {}, favorites: any = {}) {
  return new ResourceDiscoveryService(
    resourceRepository,
    likes,
    favorites,
    { createQueryBuilder: jest.fn() } as any,
    { createQueryBuilder: jest.fn() } as any,
  );
}

describe('ResourceDiscoveryService', () => {
  it('returns public home shelves with reasons, bounded pagination, and aggregate recent signals', async () => {
    const featured = resource({ id: 1, public_id: 'featured', is_featured: 1, rating_count: 3 });
    const latest = resource({ id: 2, public_id: 'latest', created_at: new Date('2026-10-01T00:00:00Z'), rating_count: 0 });
    const candidates = query([featured, latest]);
    const viewBuilder: any = {
      select: jest.fn(() => viewBuilder), addSelect: jest.fn(() => viewBuilder), where: jest.fn(() => viewBuilder),
      andWhere: jest.fn(() => viewBuilder), groupBy: jest.fn(() => viewBuilder),
      getRawMany: jest.fn().mockResolvedValue([{ resource_id: '2', count: '4' }]),
    };
    const downloadBuilder: any = {
      select: jest.fn(() => downloadBuilder), addSelect: jest.fn(() => downloadBuilder), where: jest.fn(() => downloadBuilder),
      andWhere: jest.fn(() => downloadBuilder), groupBy: jest.fn(() => downloadBuilder),
      getRawMany: jest.fn().mockResolvedValue([{ resource_id: '2', count: '2' }]),
    };
    const resourceRepository = { createQueryBuilder: jest.fn().mockReturnValue(candidates) };
    const views = { createQueryBuilder: jest.fn().mockReturnValue(viewBuilder) };
    const downloads = { createQueryBuilder: jest.fn().mockReturnValue(downloadBuilder) };
    const result = await new ResourceDiscoveryService(resourceRepository as any, {} as any, {} as any, views as any, downloads as any).home(undefined, 1, 1);

    expect(candidates.where).toHaveBeenCalledWith('resource.deleted_at IS NULL');
    expect(candidates.andWhere).toHaveBeenCalledWith('resource.is_public = 1');
    expect(candidates.andWhere).toHaveBeenCalledWith('resource.status IN (:...visibleStatuses)', { visibleStatuses: ['approved', 'published'] });
    expect(candidates.andWhere).toHaveBeenCalledWith("(resource.visibility IS NULL OR resource.visibility = 'public')");
    expect(candidates.andWhere).toHaveBeenCalledWith('(resourceCategory.id IS NULL OR resourceCategory.is_active = 1)');
    expect(candidates.andWhere).toHaveBeenCalledWith('resource.public_id IS NOT NULL');
    expect(candidates.take).toHaveBeenCalledWith(400);
    expect(result.sections.featured.items[0].resource.public_id).toBe('featured');
    expect(result.sections.featured.items[0].reasons).toEqual(['editor_pick']);
    expect(result.sections.rising.pagination).toEqual(expect.objectContaining({ page: 1, limit: 1, items_in_window: 2, candidate_window_size: 400 }));
    expect(result.sections.rising.items[0].recent_views).toBe(4);
    expect(result.sections.rising.items[0].recent_downloads).toBe(2);
  });

  it('returns the bounded download ranking with public visibility filters and pagination', async () => {
    const popular = resource({ id: 2, public_id: 'download-leader', download_count: '91' });
    const candidates = query([popular]);
    const resourceRepository = { createQueryBuilder: jest.fn().mockReturnValue(candidates) };
    const result = await service(resourceRepository).hot(1, 1);

    expect(candidates.where).toHaveBeenCalledWith('resource.deleted_at IS NULL');
    expect(candidates.andWhere).toHaveBeenCalledWith('resource.is_public = 1');
    expect(candidates.andWhere).toHaveBeenCalledWith('resource.status IN (:...visibleStatuses)', { visibleStatuses: ['approved', 'published'] });
    expect(candidates.andWhere).toHaveBeenCalledWith("(resource.visibility IS NULL OR resource.visibility = 'public')");
    expect(candidates.andWhere).toHaveBeenCalledWith('(resourceCategory.id IS NULL OR resourceCategory.is_active = 1)');
    expect(candidates.orderBy).toHaveBeenCalledWith('resource.download_count', 'DESC');
    expect(candidates.take).toHaveBeenCalledWith(300);
    expect(result.algorithm).toBe('resource-download-count-v1');
    expect(result.items[0]).toMatchObject({ resource: { public_id: 'download-leader' }, score: 91, reasons: ['top_downloaded'] });
    expect(result.pagination).toEqual(expect.objectContaining({ page: 1, limit: 1, items_in_window: 1, candidate_window_size: 300, candidate_window_truncated: false }));
  });

  it('ranks structurally related resources above unrelated popularity and exposes reasons', async () => {
    const source = resource({ id: 1, public_id: 'source' });
    const closeMatch = resource({
      id: 2,
      public_id: 'close',
      title: 'Logic Power Blueprint',
      metadata_json: { tags: ['logic', 'power', 'router'] },
      view_count: '1',
      download_count: 0,
      rating_count: 0,
      rating_average: 0,
    });
    const popularButUnrelated = resource({
      id: 3,
      public_id: 'popular',
      title: 'Popular Map',
      resource_kind: 'map',
      category_id: 99,
      metadata_json: { tags: ['survival'] },
      view_count: '50000',
      download_count: 2000,
      rating_count: 200,
      rating_average: 5,
    });

    const sourceQuery = query(source);
    const candidateQuery = query([popularButUnrelated, closeMatch]);
    const resourceRepository = {
      createQueryBuilder: jest.fn()
        .mockReturnValueOnce(sourceQuery)
        .mockReturnValueOnce(candidateQuery),
    };

    const result = await service(resourceRepository).related('source', 2);

    expect(result.algorithm).toBe('resource-related-v1');
    expect(result.items[0].resource.public_id).toBe('close');
    expect(result.items[0].reasons).toEqual(expect.arrayContaining([
      'same_kind',
      'same_category',
      expect.stringContaining('shared_tags:'),
    ]));
    expect(sourceQuery.andWhere).toHaveBeenCalledWith('resource.public_id = :publicId', { publicId: 'source' });
  });

  it('builds a personalized profile only from currently visible liked/favorited resources', async () => {
    const seed = resource({ id: 11, public_id: 'seed', metadata_json: { tags: ['logic', 'power'] } });
    const matching = resource({ id: 12, public_id: 'matching', metadata_json: { tags: ['logic'] }, view_count: '3' });
    const unrelated = resource({ id: 13, public_id: 'unrelated', resource_kind: 'map', category_id: 50, metadata_json: { tags: ['survival'] }, view_count: '4' });

    const seedQuery = query([seed]);
    const candidates = query([seed, unrelated, matching]);
    const resourceRepository = {
      createQueryBuilder: jest.fn()
        .mockReturnValueOnce(seedQuery)
        .mockReturnValueOnce(candidates),
    };
    const likes = { find: jest.fn().mockResolvedValue([{ resource_id: 11 }]) };
    const favorites = { find: jest.fn().mockResolvedValue([{ resource_id: 11 }]) };

    const result = await service(resourceRepository, likes, favorites).forYou(42, undefined, 12);

    expect(result.personalized).toBe(true);
    expect(result.algorithm).toBe('resource-taste-v1');
    expect(result.privacy).toContain('currently public resources');
    expect(seedQuery.andWhere).toHaveBeenCalledWith('seed.id IN (:...seedIds)', { seedIds: [11] });
    expect(seedQuery.where).toHaveBeenCalledWith('seed.deleted_at IS NULL');
    expect(seedQuery.andWhere).toHaveBeenCalledWith('seed.is_public = 1');
    expect(seedQuery.andWhere).toHaveBeenCalledWith('seed.status IN (:...visibleStatuses)', { visibleStatuses: ['approved', 'published'] });
    expect(seedQuery.andWhere).toHaveBeenCalledWith("(seed.visibility IS NULL OR seed.visibility = 'public')");
    expect(result.items.map((item) => item.resource.public_id)).not.toContain('seed');
    expect(result.items[0].resource.public_id).toBe('matching');
    expect(result.items[0].reasons).toEqual(expect.arrayContaining([
      'kind:schematic',
      'category',
      expect.stringContaining('tags:'),
    ]));
    expect(likes.find).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: 42 } }));
    expect(favorites.find).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: 42 } }));
  });

  it('falls back to non-personalized ranking when all interaction seeds are no longer visible', async () => {
    const hiddenSeedQuery = query([]);
    const fallbackCandidates = query([resource({ id: 21, public_id: 'fallback' })]);
    const resourceRepository = {
      createQueryBuilder: jest.fn()
        .mockReturnValueOnce(hiddenSeedQuery)
        .mockReturnValueOnce(fallbackCandidates),
    };
    const likes = { find: jest.fn().mockResolvedValue([{ resource_id: 999 }]) };
    const favorites = { find: jest.fn().mockResolvedValue([]) };

    const result = await service(resourceRepository, likes, favorites).forYou(42, undefined, 12);

    expect(result.personalized).toBe(false);
    expect(result.algorithm).toBe('resource-trending-v1');
    expect(result.privacy).toBe('No personal profile was used.');
    expect(result.items[0].resource.public_id).toBe('fallback');
  });

  it('returns the same not-found result for missing and private related sources', async () => {
    const hiddenSourceQuery = query(null);
    const resourceRepository = { createQueryBuilder: jest.fn().mockReturnValue(hiddenSourceQuery) };
    await expect(service(resourceRepository).related('private-public-id')).rejects.toMatchObject({ status: 404 });
    expect(hiddenSourceQuery.where).toHaveBeenCalledWith('resource.deleted_at IS NULL');
    expect(hiddenSourceQuery.andWhere).toHaveBeenCalledWith('resource.is_public = 1');
    expect(hiddenSourceQuery.andWhere).toHaveBeenCalledWith('resource.status IN (:...visibleStatuses)', { visibleStatuses: ['approved', 'published'] });
    expect(hiddenSourceQuery.andWhere).toHaveBeenCalledWith("(resource.visibility IS NULL OR resource.visibility = 'public')");
    expect(hiddenSourceQuery.andWhere).toHaveBeenCalledWith('(resourceCategory.id IS NULL OR resourceCategory.is_active = 1)');
  });
});

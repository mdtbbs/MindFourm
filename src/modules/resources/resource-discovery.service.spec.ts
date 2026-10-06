import { ResourceDiscoveryService } from './resource-discovery.service';

function query<T>(result: T) {
  const builder: any = {
    where: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    take: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
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

  it('builds a personalized profile from likes and favorites, excludes seeds, and prefers matching tags', async () => {
    const seed = resource({ id: 11, public_id: 'seed', metadata_json: { tags: ['logic', 'power'] } });
    const matching = resource({ id: 12, public_id: 'matching', metadata_json: { tags: ['logic'] }, view_count: '3' });
    const unrelated = resource({ id: 13, public_id: 'unrelated', resource_kind: 'map', category_id: 50, metadata_json: { tags: ['survival'] }, view_count: '4' });

    const candidates = query([seed, unrelated, matching]);
    const resourceRepository = {
      find: jest.fn().mockResolvedValue([seed]),
      createQueryBuilder: jest.fn().mockReturnValue(candidates),
    };
    const likes = { find: jest.fn().mockResolvedValue([{ resource_id: 11 }]) };
    const favorites = { find: jest.fn().mockResolvedValue([{ resource_id: 11 }]) };

    const result = await service(resourceRepository, likes, favorites).forYou(42, undefined, 12);

    expect(result.personalized).toBe(true);
    expect(result.algorithm).toBe('resource-taste-v1');
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
});

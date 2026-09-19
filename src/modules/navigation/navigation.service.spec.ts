// The production Nest packages are ESM in this checkout while Jest runs the
// unit suite through its CommonJS transformer. These narrow mocks keep this
// isolated service test focused on the read-model contract rather than the
// framework loader.
jest.mock('@nestjs/common', () => ({
  Injectable: () => () => undefined,
  Logger: class { warn = jest.fn(); },
}));
jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('@entities/category.entity', () => ({ Category: class Category {} }));
jest.mock('@entities/resource-category.entity', () => ({ ResourceCategory: class ResourceCategory {} }));
jest.mock('@entities/tag.entity', () => ({ Tag: class Tag {} }));
jest.mock('@entities/setting.entity', () => ({ Setting: class Setting {} }));
jest.mock('@database/redis.service', () => ({ RedisService: class RedisService {} }));
jest.mock('@common/services/revalidation.service', () => ({ RevalidationService: class RevalidationService {} }));

import { NavigationService } from './navigation.service';

function chain(result: unknown) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['leftJoin', 'addSelect', 'where', 'andWhere', 'groupBy', 'orderBy', 'addOrderBy', 'take']) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.getRawMany = jest.fn().mockResolvedValue(result);
  return builder;
}

describe('NavigationService', () => {
  const cachedSnapshot = {
    forumCategories: [],
    resourceTypes: [],
    featuredTags: [],
    links: [],
  };

  function createService(overrides: {
    redis?: Partial<{ get: jest.Mock; set: jest.Mock; del: jest.Mock }>;
    revalidation?: Partial<{ triggerRevalidation: jest.Mock }>;
  } = {}) {
    const categoryBuilder = chain([{
      category_id: '1', category_name: '讨论', category_slug: 'discussion',
      category_sort_order: '1', category_is_active: 1, category_description: null,
      category_color: '#123456', category_icon: 'MessageSquare', category_group_key: 'community',
      category_parent_id: null, category_show_in_sidebar: 1, post_count: '4',
    }]);
    const tagBuilder = chain([{
      tag_id: '8', tag_name: 'BetaMindy', tag_slug: 'betamindy', post_count: '9',
    }]);
    const redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      ...overrides.redis,
    };
    const revalidation = {
      triggerRevalidation: jest.fn().mockResolvedValue(undefined),
      ...overrides.revalidation,
    };
    const service = new NavigationService(
      { createQueryBuilder: jest.fn().mockReturnValue(categoryBuilder) } as any,
      { find: jest.fn().mockResolvedValue([{
        id: 2, name: '模组', slug: 'mod', description: '资源', icon: 'Puzzle', sort_order: 2, is_active: 1,
      }]) } as any,
      { createQueryBuilder: jest.fn().mockReturnValue(tagBuilder) } as any,
      { findOne: jest.fn().mockResolvedValue({ value: JSON.stringify([
        { label: 'Mindustry', href: 'https://mindustrygame.github.io/', description: '官方网站' },
        { label: 'unsafe', href: 'javascript:alert(1)' },
      ]) }) } as any,
      redis as any,
      revalidation as any,
    );
    return { service, redis, revalidation, categoryBuilder, tagBuilder };
  }

  it('returns a valid Redis snapshot without touching repositories', async () => {
    const { service, redis } = createService({
      redis: { get: jest.fn().mockResolvedValue(JSON.stringify(cachedSnapshot)) },
    });

    await expect(service.getPublicSnapshot()).resolves.toEqual(cachedSnapshot);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('builds, filters and caches the complete public snapshot on a cache miss', async () => {
    const { service, redis, categoryBuilder, tagBuilder } = createService();

    const snapshot = await service.getPublicSnapshot();

    expect(snapshot.forumCategories).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 1, name: '讨论', post_count: 4, show_in_sidebar: true }),
    ]));
    expect(snapshot.resourceTypes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 2, name: '模组', is_active: true }),
    ]));
    expect(snapshot.featuredTags).toEqual([{ id: 8, name: 'BetaMindy', slug: 'betamindy', post_count: 9 }]);
    expect(snapshot.links).toEqual([{ label: 'Mindustry', href: 'https://mindustrygame.github.io/', description: '官方网站' }]);
    expect(categoryBuilder.where).toHaveBeenCalledWith('category.is_active = :isActive', { isActive: 1 });
    expect(categoryBuilder.andWhere).toHaveBeenCalledWith('category.show_in_sidebar = :showInSidebar', { showInSidebar: 1 });
    expect(tagBuilder.take).toHaveBeenCalledWith(12);
    expect(redis.set).toHaveBeenCalledWith('cache:navigation:v1', JSON.stringify(snapshot), 3600);
  });

  it('clears the Redis snapshot and revalidates the tagged SSR data', async () => {
    const { service, redis, revalidation } = createService();

    await service.invalidate();

    expect(redis.del).toHaveBeenCalledWith('cache:navigation:v1');
    expect(revalidation.triggerRevalidation).toHaveBeenCalledWith('/', 'navigation');
  });
});

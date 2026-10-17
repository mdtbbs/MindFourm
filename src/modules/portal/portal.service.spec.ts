const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({ Injectable: decorator, Logger: class Logger { warn = jest.fn(); } }));
jest.mock('@nestjs/typeorm', () => ({ InjectRepository: decorator }));
jest.mock('@entities/resource.entity', () => ({ Resource: class Resource {} }));
jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/category.entity', () => ({ Category: class Category {} }));
jest.mock('@entities/resource-category.entity', () => ({ ResourceCategory: class ResourceCategory {} }));
jest.mock('@entities/knowledge-article.entity', () => ({ KnowledgeArticle: class KnowledgeArticle {} }));
jest.mock('@entities/game-version.entity', () => ({ GameVersion: class GameVersion {} }));
jest.mock('@entities/notice.entity', () => ({ Notice: class Notice {} }));
jest.mock('@database/redis.service', () => ({ RedisService: class RedisService {} }));
jest.mock('../posts/post-summary.service', () => ({ PostSummaryService: class PostSummaryService {} }));

import { PortalService } from './portal.service';

function noticeBuilder(value: unknown) {
  return { select: jest.fn().mockReturnThis(), maxExecutionTime: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue(value) };
}

function createService(options: { resourceFailure?: boolean; boardFailure?: boolean } = {}) {
  const posts = [{ id: 2, title: 'Human discussion', source: 'USER', created_at: new Date(), last_activity_at: new Date() }];
  const postQb = { ...noticeBuilder([]), leftJoin: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), getRawAndEntities: jest.fn().mockResolvedValue({ entities: posts, raw: posts.map(p => ({ post_id: p.id, post_card_excerpt: 'Summary' })) }) };
  const postRepo = { createQueryBuilder: jest.fn().mockReturnValue(postQb), manager: { query: jest.fn((sql: string) => sql.includes('resource_kind as kind')
    ? Promise.resolve([{ kind: 'mod', total: 3 }, { kind: 'save', total: 1 }])
    : Promise.resolve([{ posts: 46193, replies: 1200, members: 211603, resources: 9, today_posts: 28 }])) } };
  const categoryQb = { ...noticeBuilder([]), leftJoin: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), groupBy: jest.fn().mockReturnThis(), getRawMany: jest.fn(() => options.boardFailure
    ? Promise.reject(new Error('categories unavailable'))
    : Promise.resolve([
      { category_id: 1, category_name: '讨论交流', category_slug: 'talk', category_icon: null, category_color: null, category_description: null, category_group_key: 'community', category_parent_id: null, post_count: 12 },
      { category_id: 2, category_name: '子版块', category_slug: 'sub', category_icon: null, category_color: null, category_description: null, category_group_key: 'community', category_parent_id: 1, post_count: 2 },
      { category_id: 3, category_name: '运营反馈', category_slug: 'feedback', category_icon: null, category_color: null, category_description: null, category_group_key: 'meta', category_parent_id: null, post_count: 0 },
    ])) };
  const categoryRepo = { createQueryBuilder: jest.fn().mockReturnValue(categoryQb) };
  const knowledgeRepo = { find: jest.fn().mockResolvedValue([{ id: 3, title: 'News', slug: 'news', category: 'news' }]) };
  const noticeQb = noticeBuilder([{ id: 4, public_id: 'notice-1', title: 'Notice', excerpt: null, published_at: new Date('2026-09-20') }]);
  const noticeRepo = { createQueryBuilder: jest.fn().mockReturnValue(noticeQb) };
  const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
  const postSummary = { toSummaryList: jest.fn().mockResolvedValue([{ id: 2, title: 'Human discussion', source: 'USER' }]) };
  const sections: Record<string, unknown[]> = {
    resources: [{ id: 1, title: 'A resource', resource_kind: 'mod' }],
    'development:issues': [{ external_id: '42', url: '/posts/5-development-issue' }],
    'development:pull_requests': [{ external_id: '43', url: '/posts/6-development-pull-request' }],
  };
  const sectionRegistry = { getSection: jest.fn((key: string) => options.resourceFailure && key === 'resources'
    ? Promise.reject(new Error('database timeout')) : Promise.resolve(sections[key] || [])) };
  const resourceCategoryRepo = { find: jest.fn().mockResolvedValue([]) };
  return {
    noticeQb, noticeRepo,
    service: new PortalService(postRepo as any, categoryRepo as any, resourceCategoryRepo as any, knowledgeRepo as any, noticeRepo as any, redis as any, postSummary as any, sectionRegistry as any),
    postRepo, postQb, categoryQb, redis, sectionRegistry,
  };
}

describe('PortalService homepage read model', () => {
  it('aggregates independently and limits GitHub issue and PR cards separately', async () => {
    const { service, postQb, noticeQb, redis } = createService();
    const home = await service.getHomeData();

    expect(home.discussions).toMatchObject({ state: 'ready', items: [{ title: 'Human discussion', source: 'USER' }] });
    expect(home.resources).toMatchObject({ state: 'ready', items: [{ title: 'A resource', resource_kind: 'mod' }] });
    expect(home.development.issues.items).toEqual([expect.objectContaining({ external_id: '42', url: '/posts/5-development-issue' })]);
    expect(home.development.pull_requests.items).toEqual([expect.objectContaining({ external_id: '43', url: '/posts/6-development-pull-request' })]);
    expect(postQb.andWhere).toHaveBeenCalledWith('post.required_group_id IS NULL', undefined);
    expect(postQb.andWhere).toHaveBeenCalledWith('post.source = :source', { source: 'USER' });
    // `policy` notices are legal documents and must not occupy the announcement slot.
    expect(noticeQb.andWhere).toHaveBeenCalledWith('notice.notice_type IN (:...operationalNoticeTypes)', { operationalNoticeTypes: ['system', 'maintenance', 'event', 'release'] });
    expect(postQb.take).toHaveBeenCalledWith(6);
    expect(postQb.select.mock.calls[0][0]).not.toContain('post.content');
    expect(redis.set).toHaveBeenCalledWith('cache:home:v3', expect.any(String), 600);
  });

  it('fills the homepage board grid, resource kinds and community totals', async () => {
    const { service } = createService();
    const home = await service.getHomeData();

    // Boards keep child ordering and the root/child depth, and never drop a board
    // just because the operator hid it from the sidebar.
    expect(home.boards.map((board) => board.name)).toEqual(['讨论交流', '子版块', '运营反馈']);
    expect(home.boards[1]).toMatchObject({ depth: 1, post_count: 2 });
    expect(home.resource_kinds).toEqual([{ kind: 'mod', label: 'Mod', count: 3 }, { kind: 'save', label: '存档', count: 1 }]);
    expect(home.stats).toMatchObject({ posts: 46193, members: 211603, today_posts: 28 });
  });

  it('treats a failed board query as an empty grid instead of failing the homepage', async () => {
    const { service } = createService({ boardFailure: true });
    const home = await service.getHomeData();

    expect(home.boards).toEqual([]);
    expect(home.discussions.items).toHaveLength(1);
    expect(home.stats?.members).toBe(211603);
  });

  it('keeps unrelated modules available when a resource query fails', async () => {
    const { service } = createService({ resourceFailure: true });
    const home = await service.getHomeData();

    expect(home.resources).toEqual({ state: 'unavailable', items: [] });
    expect(home.discussions).toMatchObject({ state: 'ready', items: [{ title: 'Human discussion' }] });
    expect(home.notices).toMatchObject({ state: 'ready', items: [{ title: 'Notice' }] });
  });
  it('coalesces simultaneous cold misses into one build and cache write', async () => {
    const { service, postRepo, redis, sectionRegistry } = createService();
    const homes = await Promise.all(Array.from({ length: 20 }, () => service.getHomeData()));
    expect(postRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(sectionRegistry.getSection).toHaveBeenCalledTimes(3);
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(homes.every(home => home === homes[0])).toBe(true);
  });

  it('preserves known stale sections inside a fresh aggregate cache', async () => {
    const { service, redis } = createService();
    const home = await service.getHomeData();
    home.resources.state = 'stale';
    redis.get.mockResolvedValue(JSON.stringify({ ...home, cached_at: new Date().toISOString() }));
    expect((await service.getHomeData()).resources.state).toBe('stale');
  });

  it('bounds an unresponsive module and returns the other sections', async () => {
    jest.useFakeTimers();
    try {
      const { service, sectionRegistry } = createService();
      const normal = sectionRegistry.getSection.getMockImplementation()!;
      sectionRegistry.getSection.mockImplementation(key => key === 'resources' ? new Promise(() => {}) : normal(key));
      const pending = service.getHomeData();
      await jest.advanceTimersByTimeAsync(2500);
      const home = await pending;
      expect(home.resources.state).toBe('unavailable');
      expect(home.discussions.items).toHaveLength(1);
    } finally { jest.useRealTimers(); }
  });

});

const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({ Injectable: decorator, Logger: class Logger { warn = jest.fn(); } }));
jest.mock('@nestjs/typeorm', () => ({ InjectRepository: decorator }));
jest.mock('@entities/resource.entity', () => ({ Resource: class Resource {} }));
jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/knowledge-article.entity', () => ({ KnowledgeArticle: class KnowledgeArticle {} }));
jest.mock('@entities/game-version.entity', () => ({ GameVersion: class GameVersion {} }));
jest.mock('@entities/notice.entity', () => ({ Notice: class Notice {} }));
jest.mock('@database/redis.service', () => ({ RedisService: class RedisService {} }));
jest.mock('../posts/post-summary.service', () => ({ PostSummaryService: class PostSummaryService {} }));

import { PortalService } from './portal.service';

function noticeBuilder(value: unknown) {
  return { select: jest.fn().mockReturnThis(), maxExecutionTime: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue(value) };
}

function createService(options: { resourceFailure?: boolean } = {}) {
  const posts = [{ id: 2, title: 'Human discussion', source: 'USER', created_at: new Date(), last_activity_at: new Date() }];
  const postQb = { ...noticeBuilder([]), leftJoin: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), getRawAndEntities: jest.fn().mockResolvedValue({ entities: posts, raw: posts.map(p => ({ post_id: p.id, post_card_excerpt: 'Summary' })) }) };
  const postRepo = { createQueryBuilder: jest.fn().mockReturnValue(postQb) };
  const knowledgeRepo = { find: jest.fn().mockResolvedValue([{ id: 3, title: 'News', slug: 'news', category: 'news' }]) };
  const noticeRepo = { createQueryBuilder: jest.fn().mockReturnValue(noticeBuilder([{ id: 4, public_id: 'notice-1', title: 'Notice', excerpt: null, published_at: new Date('2026-09-20') }])) };
  const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
  const postSummary = { toSummaryList: jest.fn().mockResolvedValue([{ id: 2, title: 'Human discussion', source: 'USER' }]) };
  const sections: Record<string, unknown[]> = {
    resources: [{ id: 1, title: 'A resource', resource_kind: 'mod' }],
    'development:issues': [{ external_id: '42', url: '/posts/5-development-issue' }],
    'development:pull_requests': [{ external_id: '43', url: '/posts/6-development-pull-request' }],
  };
  const sectionRegistry = { getSection: jest.fn((key: string) => options.resourceFailure && key === 'resources'
    ? Promise.reject(new Error('database timeout')) : Promise.resolve(sections[key] || [])) };
  return { service: new PortalService(postRepo as any, knowledgeRepo as any, noticeRepo as any, redis as any, postSummary as any, sectionRegistry as any), postRepo, postQb, redis, sectionRegistry };
}

describe('PortalService homepage read model', () => {
  it('aggregates independently and limits GitHub issue and PR cards separately', async () => {
    const { service, postQb, redis } = createService();
    const home = await service.getHomeData();

    expect(home.discussions).toMatchObject({ state: 'ready', items: [{ title: 'Human discussion', source: 'USER' }] });
    expect(home.resources).toMatchObject({ state: 'ready', items: [{ title: 'A resource', resource_kind: 'mod' }] });
    expect(home.development.issues.items).toEqual([expect.objectContaining({ external_id: '42', url: '/posts/5-development-issue' })]);
    expect(home.development.pull_requests.items).toEqual([expect.objectContaining({ external_id: '43', url: '/posts/6-development-pull-request' })]);
    expect(postQb.andWhere).toHaveBeenCalledWith('post.required_group_id IS NULL', undefined);
    expect(postQb.andWhere).toHaveBeenCalledWith('post.source = :source', { source: 'USER' });
    expect(postQb.take).toHaveBeenCalledWith(6);
    expect(postQb.select.mock.calls[0][0]).not.toContain('post.content');
    expect(redis.set).toHaveBeenCalledWith('cache:home:v2', expect.any(String), 600);
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

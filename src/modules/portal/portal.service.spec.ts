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
  return { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue(value) };
}

function createService(options: { resourceFailure?: boolean } = {}) {
  const posts = [{ id: 2, title: 'Human discussion', source: 'USER', created_at: new Date(), last_activity_at: new Date() }];
  const postRepo = { find: jest.fn().mockResolvedValue(posts) };
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
  return { service: new PortalService(postRepo as any, knowledgeRepo as any, noticeRepo as any, redis as any, postSummary as any, sectionRegistry as any), postRepo, redis };
}

describe('PortalService homepage read model', () => {
  it('aggregates independently and limits GitHub issue and PR cards separately', async () => {
    const { service, postRepo, redis } = createService();
    const home = await service.getHomeData();

    expect(home.discussions).toMatchObject({ state: 'ready', items: [{ title: 'Human discussion', source: 'USER' }] });
    expect(home.resources).toMatchObject({ state: 'ready', items: [{ title: 'A resource', resource_kind: 'mod' }] });
    expect(home.development.issues.items).toEqual([expect.objectContaining({ external_id: '42', url: '/posts/5-development-issue' })]);
    expect(home.development.pull_requests.items).toEqual([expect.objectContaining({ external_id: '43', url: '/posts/6-development-pull-request' })]);
    expect(postRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'published', source: 'USER' }, take: 6 }));
    expect(redis.set).toHaveBeenCalledWith('cache:home:v1', expect.any(String), 600);
  });

  it('keeps unrelated modules available when a resource query fails', async () => {
    const { service } = createService({ resourceFailure: true });
    const home = await service.getHomeData();

    expect(home.resources).toEqual({ state: 'unavailable', items: [] });
    expect(home.discussions).toMatchObject({ state: 'ready', items: [{ title: 'Human discussion' }] });
    expect(home.notices).toMatchObject({ state: 'ready', items: [{ title: 'Notice' }] });
  });
});

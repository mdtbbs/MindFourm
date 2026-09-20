const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({ Injectable: decorator, Logger: class Logger { warn = jest.fn(); } }));
jest.mock('@nestjs/typeorm', () => ({ InjectRepository: decorator }));
jest.mock('@entities/resource.entity', () => ({ Resource: class Resource {} }));
jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/knowledge-article.entity', () => ({ KnowledgeArticle: class KnowledgeArticle {} }));
jest.mock('@entities/game-version.entity', () => ({ GameVersion: class GameVersion {} }));
jest.mock('@entities/notice.entity', () => ({ Notice: class Notice {} }));
jest.mock('@entities/developer-feed-entry.entity', () => ({ DeveloperFeedEntry: class DeveloperFeedEntry {} }));
jest.mock('@database/redis.service', () => ({ RedisService: class RedisService {} }));
jest.mock('../posts/post-summary.service', () => ({ PostSummaryService: class PostSummaryService {} }));

import { PortalService } from './portal.service';

function resourceBuilder(value: unknown, rejection?: Error) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
    getMany: rejection ? jest.fn().mockRejectedValue(rejection) : jest.fn().mockResolvedValue(value),
  };
}

function noticeBuilder(value: unknown) {
  return { where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue(value) };
}

function createService(options: { resourceFailure?: boolean } = {}) {
  const resources = [{ id: 1, title: 'A resource', slug: 'a-resource', resource_kind: 'mod', version: '1.0', updated_at: new Date('2026-09-20'), user: { username: 'author' }, category: { name: 'Mod' } }];
  const posts = [{ id: 2, title: 'Human discussion', source: 'USER', created_at: new Date(), last_activity_at: new Date() }];
  const resourceRepo = { createQueryBuilder: jest.fn().mockReturnValue(resourceBuilder(resources, options.resourceFailure ? new Error('database timeout') : undefined)) };
  const postRepo = { find: jest.fn().mockResolvedValue(posts) };
  const knowledgeRepo = { find: jest.fn().mockResolvedValue([{ id: 3, title: 'News', slug: 'news', category: 'news' }]) };
  const versionRepo = { find: jest.fn().mockResolvedValue([]) };
  const noticeRepo = { createQueryBuilder: jest.fn().mockReturnValue(noticeBuilder([{ id: 4, public_id: 'notice-1', title: 'Notice', excerpt: null, published_at: new Date('2026-09-20') }])) };
  const developerFeedRepo = { find: jest.fn().mockImplementation(({ where }: any) => Promise.resolve([{ id: where.item_type === 'issue' ? 5 : 6, external_id: '42', summary: 'Development item', state: 'open', source_url: 'https://example.test/42', repository: 'org/repo', updated_at: new Date('2026-09-20') }])) };
  const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
  const postSummary = { toSummaryList: jest.fn().mockResolvedValue([{ id: 2, title: 'Human discussion', source: 'USER' }]) };
  return { service: new PortalService(resourceRepo as any, postRepo as any, knowledgeRepo as any, versionRepo as any, noticeRepo as any, developerFeedRepo as any, redis as any, postSummary as any), postRepo, developerFeedRepo, redis };
}

describe('PortalService homepage read model', () => {
  it('aggregates independently and limits GitHub issue and PR cards separately', async () => {
    const { service, postRepo, developerFeedRepo, redis } = createService();
    const home = await service.getHomeData();

    expect(home.discussions).toMatchObject({ state: 'ready', items: [{ title: 'Human discussion', source: 'USER' }] });
    expect(home.resources).toMatchObject({ state: 'ready', items: [{ title: 'A resource', resource_kind: 'mod' }] });
    expect(home.development.issues.items).toHaveLength(1);
    expect(home.development.pull_requests.items).toHaveLength(1);
    expect(postRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'published', source: 'USER' }, take: 6 }));
    expect(developerFeedRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ item_type: 'issue' }), take: 3 }));
    expect(developerFeedRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ item_type: 'pull_request' }), take: 3 }));
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

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
  const issue = { id: 5, title: '[#42] Development issue', source: 'GITHUB_ISSUE', slug: 'development-issue', created_at: new Date(), updated_at: new Date('2026-09-20'), last_activity_at: new Date('2026-09-20'), category: { name: 'iss问题动态' } };
  const pullRequest = { id: 6, title: '[#43] Development pull request', source: 'GITHUB_PR', slug: 'development-pull-request', created_at: new Date(), updated_at: new Date('2026-09-20'), last_activity_at: new Date('2026-09-20'), category: { name: 'PR合并请求' } };
  const resourceRepo = { createQueryBuilder: jest.fn().mockReturnValue(resourceBuilder(resources, options.resourceFailure ? new Error('database timeout') : undefined)) };
  const postRepo = { find: jest.fn().mockImplementation(({ where }: any) => {
    if (where.source === 'GITHUB_ISSUE') return Promise.resolve([issue]);
    if (where.source === 'GITHUB_PR') return Promise.resolve([pullRequest]);
    return Promise.resolve(posts);
  }) };
  const knowledgeRepo = { find: jest.fn().mockResolvedValue([{ id: 3, title: 'News', slug: 'news', category: 'news' }]) };
  const versionRepo = { find: jest.fn().mockResolvedValue([]) };
  const noticeRepo = { createQueryBuilder: jest.fn().mockReturnValue(noticeBuilder([{ id: 4, public_id: 'notice-1', title: 'Notice', excerpt: null, published_at: new Date('2026-09-20') }])) };
  const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
  const postSummary = { toSummaryList: jest.fn().mockResolvedValue([{ id: 2, title: 'Human discussion', source: 'USER' }]) };
  return { service: new PortalService(resourceRepo as any, postRepo as any, knowledgeRepo as any, versionRepo as any, noticeRepo as any, redis as any, postSummary as any), postRepo, redis };
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
    expect(postRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'published', source: 'GITHUB_ISSUE' }, take: 3 }));
    expect(postRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'published', source: 'GITHUB_PR' }, take: 3 }));
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

const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({
  Inject: () => () => undefined,
  Injectable: decorator,
  Logger: class Logger { warn = jest.fn(); },
}));

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  PrimaryColumn: decorator,
  Column: decorator,
  ManyToOne: decorator,
  OneToMany: decorator,
  ManyToMany: decorator,
  OneToOne: decorator,
  JoinColumn: decorator,
  JoinTable: decorator,
  CreateDateColumn: decorator,
  UpdateDateColumn: decorator,
  DeleteDateColumn: decorator,
  Index: decorator,
  Unique: decorator,
  Like: (value: string) => ({ _type: 'like', value }),
}));

jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/tag.entity', () => ({ Tag: class Tag {} }));
jest.mock('@entities/category.entity', () => ({ Category: class Category {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));
jest.mock('@entities/group-member.entity', () => ({ GroupMember: class GroupMember {} }));
jest.mock('@entities/knowledge-article.entity', () => ({ KnowledgeArticle: class KnowledgeArticle {} }));
jest.mock('../../database/redis.service', () => ({ RedisService: class RedisService {} }));
jest.mock('../posts/post-summary.service', () => ({ PostSummaryService: class PostSummaryService {} }));

import { SearchService } from './search.service';

function createQueryBuilder(posts: any[], total: number) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([posts, total]),
  };
}

function createResourceQueryBuilder(resources: any[]) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(resources),
  };
}

function createTextQueryBuilder(items: any[]) {
  return {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(items),
  };
}

function createService(overrides: {
  postRepository?: Record<string, jest.Mock>;
  postSummaryService?: Record<string, jest.Mock>;
  groupMemberRepository?: Record<string, jest.Mock>;
  userRepository?: Record<string, jest.Mock>;
  knowledgeRepository?: Record<string, jest.Mock>;
  providerRegistry?: { search: jest.Mock };
} = {}) {
  const queryBuilder = createQueryBuilder(
    [
      {
        id: 17,
        title: 'Search result',
      },
    ],
    11,
  );
  const postRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    ...overrides.postRepository,
  };
  const postSummaryService = {
    toSummaryList: jest.fn().mockResolvedValue([
      {
        id: 17,
        title: 'Search result',
        excerpt: 'summary',
      },
    ]),
    ...overrides.postSummaryService,
  };

  const userRepository = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null), ...overrides.userRepository };
  const groupMemberRepository = { find: jest.fn().mockResolvedValue([]), ...overrides.groupMemberRepository };
  const knowledgeRepository = { find: jest.fn().mockResolvedValue([]), ...overrides.knowledgeRepository };
  const redisService = {
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  };

  const providerRegistry = overrides.providerRegistry || { search: jest.fn().mockResolvedValue([]) };
  const service = new SearchService(
    postRepository as any,
    userRepository as any,
    {} as any,
    {} as any,
    groupMemberRepository as any,
    knowledgeRepository as any,
    redisService as any,
    postSummaryService as any,
    undefined,
    undefined,
    providerRegistry as any,
  );

  return {
    service,
    postRepository,
    postSummaryService,
    queryBuilder,
    groupMemberRepository,
    userRepository,
    providerRegistry,
  };
}

describe('SearchService', () => {
  it('maps post search results into public summaries and preserves pagination', async () => {
    const { service, queryBuilder, postSummaryService } = createService();

    const result = await service.searchPosts('guide', {
      page: 2,
      limit: 10,
      category: 'general',
      sort: 'relevance',
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('category.slug = :category', {
      category: 'general',
    });
    expect(queryBuilder.select).toHaveBeenCalledWith([
      'p.id',
      'p.user_id',
      'p.category_id',
      'p.post_type',
      'p.title',
      'p.content',
      'p.status',
      'p.is_pinned',
      'p.is_locked',
      'p.view_count',
      'p.like_count',
      'p.created_at',
      'p.updated_at',
      'user.id',
      'user.mindauth_id',
      'user.role',
      'category.id',
      'category.name',
      'category.slug',
    ]);
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(p.title LIKE :query OR p.content LIKE :query)',
      { query: '%guide%' },
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'CASE WHEN p.title LIKE :query THEN 1 ELSE 0 END',
      'DESC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('p.created_at', 'DESC');
    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
    expect(postSummaryService.toSummaryList).toHaveBeenCalledWith([
      expect.objectContaining({ id: 17 }),
    ]);
    expect(result).toMatchObject({
      data: [
        {
          id: 17,
          title: 'Search result',
          excerpt: 'summary',
        },
      ],
      pagination: {
        page: 2,
        limit: 10,
        total: 11,
        totalPages: 2,
      },
    });
  });

  it('returns a stable empty page when a page is beyond the last result', async () => {
    const { service, postRepository, postSummaryService } = createService({
      postRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder([], 1)),
      },
      postSummaryService: { toSummaryList: jest.fn().mockResolvedValue([]) },
    });

    await expect(service.searchPosts('missing', { page: 2, limit: 1 })).resolves.toEqual({
      data: [],
      pagination: { page: 2, limit: 1, total: 1, totalPages: 1 },
    });
    const queryBuilder = postRepository.createQueryBuilder.mock.results[0].value;
    expect(queryBuilder.skip).toHaveBeenCalledWith(1);
    expect(postSummaryService.toSummaryList).toHaveBeenCalledWith([]);
  });

  it('returns totalPages zero for no matches', async () => {
    const { service } = createService({
      postRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilder([], 0)),
      },
      postSummaryService: { toSummaryList: jest.fn().mockResolvedValue([]) },
    });

    const result = await service.searchPosts('none', { page: 1, limit: 20 });
    expect(result).toEqual({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it('delegates resource search to registered domain providers', async () => {
    const { service, providerRegistry } = createService();
    await service.searchResources('guide', 7);
    expect(providerRegistry.search).toHaveBeenCalledWith('resources', 'guide', { limit: 7 });
  });

  it('excludes group-only discussions when the searcher is anonymous', async () => {
    const { service, queryBuilder } = createService();

    await service.searchPosts('private', { page: 1, limit: 10 });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('p.required_group_id IS NULL');
  });

  it('allows a signed-in member to search only their own group discussions', async () => {
    const { service, queryBuilder, groupMemberRepository } = createService({
      groupMemberRepository: { find: jest.fn().mockResolvedValue([{ group_id: 4 }, { group_id: 9 }]) },
    });

    await service.searchPosts('mod', { page: 1, limit: 10 }, { id: 92, role: 'user' });

    expect(groupMemberRepository.find).toHaveBeenCalledWith({ where: { user_id: 92 }, select: ['group_id'] });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(p.required_group_id IS NULL OR p.required_group_id IN (:...groupIds))',
      { groupIds: [4, 9] },
    );
  });

  it('treats uid and username patterns as first-class inputs and delegates game versions', async () => {
    const providerRegistry = { search: jest.fn().mockImplementation(async (key: string) => key === 'game_versions'
      ? [{ id: 7, public_id: 'v', build: '160.4', version_value: '160.4', display_name: '160.4', channel: 'stable', is_latest: true }]
      : []) };
    const { service, userRepository } = createService({
      userRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 92, username: 'alice', avatar_url: null, bio: null }),
        find: jest.fn().mockResolvedValue([]),
      },
      providerRegistry,
    });

    const uid = await service.searchUnified('uid:92');
    const build = await service.searchUnified('160.4');
    await service.searchUsers('@alice');

    expect(uid.groups.users).toEqual([{ id: 92, username: 'alice', avatar_url: null, bio: null }]);
    expect(build.groups.game_versions).toHaveLength(1);
    expect(userRepository.find).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.arrayContaining([expect.objectContaining({ username: expect.anything() })]),
    }));
    expect(providerRegistry.search).toHaveBeenCalledWith('game_versions', '160.4', { limit: 10, viewer: undefined });
  });
});

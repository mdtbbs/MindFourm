const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({
  Inject: () => () => undefined,
  Optional: decorator,
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
jest.mock('../../config/site-profile', () => ({ SiteConfigService: class SiteConfigService {} }));

import { SearchService } from './search.service';

function createQueryBuilder(posts: any[], total: number) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    maxExecutionTime: jest.fn().mockReturnThis(),
    getRawAndEntities: jest.fn().mockResolvedValue({ entities: posts, raw: posts.map(post => ({ p_id: post.id, post_card_excerpt: 'bounded search excerpt' })) }),
    getCount: jest.fn().mockResolvedValue(total),
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
  siteConfig?: { current: { searchProviders?: readonly string[]; contentLanguagePreference?: boolean } };
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
    overrides.siteConfig as any,
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
    expect(queryBuilder.select).toHaveBeenCalledWith(expect.arrayContaining(['p.id', 'p.source', 'p.slug', 'p.last_activity_at', 'user.username', 'user.avatar_url', 'category.color', 'category.icon']));
    expect(queryBuilder.select).toHaveBeenCalledWith(expect.not.arrayContaining(['p.content', 'p.content_html', 'p.content_json']));
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(expect.stringContaining('LEFT('), 'post_card_excerpt');
    expect(queryBuilder.maxExecutionTime).toHaveBeenCalledWith(2500);
    const searchClause = queryBuilder.andWhere.mock.calls.find(([clause]) => String(clause).includes('MATCH(p.title, p.content)'));
    expect(searchClause?.[0]).toContain('p.title LIKE :query');
    expect(searchClause?.[0]).toContain('MATCH(search_reply.content)');
    expect(searchClause?.[1]).toEqual(expect.objectContaining({ query: '%guide%', fullTextQuery: 'guide' }));
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
      'search_title_match',
      'DESC',
    );
    expect(queryBuilder.addSelect).toHaveBeenCalledWith('CASE WHEN p.title LIKE :query THEN 1 ELSE 0 END', 'search_title_match');
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('p.created_at', 'DESC');
    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
    expect(postSummaryService.toSummaryList).toHaveBeenCalledWith([
      expect.objectContaining({ id: 17, content_text: 'bounded search excerpt' }),
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

  it('filters declared content language and ranks the member preferred language first', async () => {
    const { service, queryBuilder } = createService({
      siteConfig: { current: { contentLanguagePreference: true } },
    });
    await service.searchPosts('map', { page: 1, limit: 10, sort: 'relevance', content_language: 'ja' }, {
      id: 4, role: 'user', preferred_content_language: 'ru',
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('p.content_language = :contentLanguage', { contentLanguage: 'ja' });
    expect(queryBuilder.addSelect).toHaveBeenCalledWith(
      'CASE WHEN p.content_language = :preferredContentLanguage THEN 1 ELSE 0 END', 'search_language_match',
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('search_language_match', 'DESC');
  });

  it('does not apply preferred-language ranking on the MDTBBS site profile', async () => {
    const { service, queryBuilder } = createService({
      siteConfig: { current: { contentLanguagePreference: false } },
    });

    await service.searchPosts('map', { page: 1, limit: 10, sort: 'relevance', preferred_content_language: 'ru' }, {
      id: 4, role: 'user', preferred_content_language: 'ru',
    });

    expect(queryBuilder.addSelect).not.toHaveBeenCalledWith(
      'CASE WHEN p.content_language = :preferredContentLanguage THEN 1 ELSE 0 END', 'search_language_match',
    );
    expect(queryBuilder.orderBy).not.toHaveBeenCalledWith('search_language_match', 'DESC');
  });

  it('does not run search providers excluded by the active Site Profile', async () => {
    const providerRegistry = { search: jest.fn().mockResolvedValue([]) };
    const { service } = createService({
      providerRegistry,
      siteConfig: { current: { searchProviders: ['posts', 'users', 'resources'] } },
    });

    const result = await service.searchUnified('guide');

    expect(providerRegistry.search).toHaveBeenCalledTimes(1);
    expect(providerRegistry.search).toHaveBeenCalledWith('resources', 'guide', expect.any(Object));
    expect(result.groups.developer_feed).toEqual([]);
  });

  it('keeps per-user language ranking out of MDTBBS unified search providers', async () => {
    const providerRegistry = { search: jest.fn().mockResolvedValue([]) };
    const { service, queryBuilder } = createService({
      providerRegistry,
      siteConfig: { current: { searchProviders: ['posts', 'resources'], contentLanguagePreference: false } },
    });

    await service.searchUnified('map', { id: 4, role: 'user', preferred_content_language: 'ru' });

    expect(queryBuilder.addSelect).not.toHaveBeenCalledWith(
      'CASE WHEN p.content_language = :preferredContentLanguage THEN 1 ELSE 0 END', 'search_language_match',
    );
    expect(providerRegistry.search).toHaveBeenCalledWith('resources', 'map', expect.objectContaining({
      preferred_content_language: undefined,
    }));
  });

  it('bounds malformed internal pagination arguments and preserves LIKE escaping', async () => {
    const { service, queryBuilder } = createService();
    const result = await service.searchPosts('50%_\\', { page: -5, limit: 5000 });
    expect(result.pagination).toMatchObject({ page: 1, limit: 50 });
    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(queryBuilder.take).toHaveBeenCalledWith(50);
    const searchClause = queryBuilder.andWhere.mock.calls.find(([clause]) => String(clause).includes('MATCH(p.title, p.content)'));
    expect(searchClause?.[0]).toContain('p.title LIKE :query');
    expect(searchClause?.[1]).toEqual(expect.objectContaining({ query: '%50\\%\\_\\\\%', fullTextQuery: '50%_\\' }));
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
    expect(providerRegistry.search).toHaveBeenCalledWith('resources', 'guide', expect.objectContaining({ limit: 7, page: 1 }));
  });

  it('suggests aggregate public popular terms without reading personal search history', async () => {
    const { service } = createService();
    const popular = jest.spyOn(service, 'getPopularSearches').mockResolvedValue(['Mindustry', 'mindustry mods', 'other topic']);

    await expect(service.getSearchSuggestions('MiNd', 4)).resolves.toEqual(['Mindustry', 'mindustry mods']);
    await expect(service.getSearchSuggestions('mindusty', 4)).resolves.toEqual(['Mindustry']);
    expect(popular).toHaveBeenCalledWith(10);
  });

  it('uses a single deterministic typo suggestion only when exact results are empty', async () => {
    const { service } = createService();
    const exact = { groups: { users: [], posts: [], resources: [], servers: [], game_versions: [], wiki: [], developer_feed: [] }, total_by_type: { users: 0, posts: 0, resources: 0, servers: 0, game_versions: 0, wiki: 0, developer_feed: 0 }, unavailable: [], pagination: { page: 1, limit: 10, has_more: false } };
    const corrected = { ...exact, groups: { ...exact.groups, posts: [{ id: 1 }] }, total_by_type: { ...exact.total_by_type, posts: 1 } };
    const search = jest.spyOn(service, 'searchUnified').mockResolvedValueOnce(exact as any).mockResolvedValueOnce(corrected as any);
    jest.spyOn(service, 'getSearchSuggestions').mockResolvedValue(['mindustry']);

    await expect(service.searchUnifiedWithSuggestion('mindustyr', undefined, { type: 'posts' })).resolves.toMatchObject({
      suggested_query: 'mindustry', total_by_type: { posts: 1 },
    });
    expect(search).toHaveBeenNthCalledWith(2, 'mindustry', undefined, { type: 'posts' });
  });

  it('excludes group-only discussions when the searcher is anonymous', async () => {
    const { service, queryBuilder } = createService();

    await service.searchPosts('private', { page: 1, limit: 10 });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('p.required_group_id IS NULL', undefined);
  });

  it('allows a signed-in member to search only their own group discussions', async () => {
    const { service, queryBuilder, groupMemberRepository } = createService({
      groupMemberRepository: { find: jest.fn().mockResolvedValue([{ group_id: 4 }, { group_id: 9 }]) },
    });

    await service.searchPosts('mod', { page: 1, limit: 10 }, { id: 92, role: 'user' });

    expect(groupMemberRepository.find).not.toHaveBeenCalled();
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('post_visibility_member.group_id = p.required_group_id'),
      { postVisibilityUser: 92 },
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
    expect(providerRegistry.search).toHaveBeenCalledWith('game_versions', '160.4', expect.objectContaining({ limit: 10, page: 1, viewer: undefined }));
  });
  it('keeps other search groups when one provider fails and marks missing groups', async () => {
    const providers = { search: jest.fn((key: string) => key === 'resources' ? Promise.reject(new Error('down')) : Promise.resolve([{ id: 1 }])) };
    const { service } = createService({ providerRegistry: providers });
    const result = await service.searchUnified('guide');
    expect(result.groups.resources).toEqual([]);
    expect(result.groups.posts).toHaveLength(1);
    expect(result.groups.servers).toHaveLength(1);
    expect(result.unavailable).toEqual(['resources']);
  });

  it('bounds an unresponsive provider without losing successful search groups', async () => {
    jest.useFakeTimers();
    try {
      const providers = { search: jest.fn((key: string) => key === 'resources' ? new Promise<unknown[]>(() => {}) : Promise.resolve([])) };
      const { service } = createService({ providerRegistry: providers });
      const pending = service.searchUnified('guide');
      await jest.advanceTimersByTimeAsync(2500);
      const result = await pending;
      expect(result.unavailable).toEqual(['resources']);
      expect(result.groups.posts).toHaveLength(1);
    } finally { jest.useRealTimers(); }
  });

});

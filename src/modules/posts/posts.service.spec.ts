const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
  Brackets: class Brackets {},
  In: (value: unknown) => ({ __op: 'In', value }),
  LessThan: (value: unknown) => ({ __op: 'LessThan', value }),
  MoreThan: (value: unknown) => ({ __op: 'MoreThan', value }),
  Like: (value: unknown) => ({ __op: 'Like', value }),
  Not: (value: unknown) => ({ __op: 'Not', value }),
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
}));

jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));
jest.mock('@entities/category.entity', () => ({ Category: class Category {} }));
jest.mock('@entities/tag.entity', () => ({ Tag: class Tag {} }));
jest.mock('@entities/post-tag.entity', () => ({ PostTag: class PostTag {} }));
jest.mock('@entities/reply.entity', () => ({ Reply: class Reply {} }));

import { PostsService } from './posts.service';

function createQueryBuilderMock(result: { many?: any[]; total?: number } = {}) {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([result.many ?? [], result.total ?? 0]),
    getMany: jest.fn().mockResolvedValue(result.many ?? []),
  };
}

function createService(overrides: {
  postRepository?: Record<string, jest.Mock>;
  replyRepository?: Record<string, jest.Mock>;
  redisService?: Record<string, jest.Mock>;
  groupsService?: Record<string, jest.Mock>;
  postSummaryService?: Record<string, jest.Mock>;
  postDetailService?: Record<string, jest.Mock>;
} = {}) {
  const listQueryBuilder = createQueryBuilderMock();
  const postRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(listQueryBuilder),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    update: jest.fn(),
    increment: jest.fn(),
    softDelete: jest.fn(),
    delete: jest.fn(),
    ...overrides.postRepository,
  };
  const replyRepository = {
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    ...overrides.replyRepository,
  };
  const redisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    ...overrides.redisService,
  };
  const groupsService = {
    checkMembership: jest.fn().mockResolvedValue(true),
    ...overrides.groupsService,
  };
  const postSummaryService = {
    toSummaryList: jest.fn().mockResolvedValue([]),
    ...overrides.postSummaryService,
  };
  const postDetailService = {
    toDetail: jest.fn().mockResolvedValue({
      id: 12,
      title: 'Detailed post',
    }),
    toReplies: jest.fn().mockResolvedValue([]),
    ...overrides.postDetailService,
  };

  const service = new PostsService(
    postRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    replyRepository as any,
    {} as any,
    redisService as any,
    {} as any,
    groupsService as any,
    { execute: jest.fn() } as any,
    {} as any,
    {} as any,
    { getBoolean: jest.fn() } as any,
    postSummaryService as any,
    postDetailService as any,
  );

  return {
    service,
    postRepository,
    replyRepository,
    redisService,
    groupsService,
    postSummaryService,
    postDetailService,
    listQueryBuilder,
  };
}

describe('PostsService', () => {
  it('returns public list summaries and defaults to published posts', async () => {
    const queryBuilder = createQueryBuilderMock({
      many: [
        {
          id: 12,
          title: 'Public post',
        },
      ],
      total: 1,
    });
    const { service, postRepository, postSummaryService } = createService({
      postRepository: {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      },
      postSummaryService: {
        toSummaryList: jest.fn().mockResolvedValue([
          {
            id: 12,
            title: 'Public post',
            excerpt: 'summary',
          },
        ]),
      },
    });

    const result = await service.findAll({ page: 1, limit: 20 });

    expect(postRepository.createQueryBuilder).toHaveBeenCalledWith('post');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('post.status = :status', { status: 'published' });
    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(queryBuilder.take).toHaveBeenCalledWith(20);
    expect(postSummaryService.toSummaryList).toHaveBeenCalledWith([
      expect.objectContaining({ id: 12 }),
    ]);
    expect(result).toMatchObject({
      data: [
        {
          id: 12,
          title: 'Public post',
          excerpt: 'summary',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('maps a post detail DTO and caches the mapped response', async () => {
    const { service, postRepository, postDetailService, redisService } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 88,
          required_group_id: null,
          user: { mindauth_id: 1234, role: 'admin' },
          category: { name: 'General', slug: 'general' },
        }),
      },
      postDetailService: {
        toDetail: jest.fn().mockResolvedValue({
          id: 88,
          title: 'Detailed post',
          category_name: 'General',
          author_mindauth_id: 1234,
        }),
      },
      redisService: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        del: jest.fn(),
      },
    });

    const result = await service.findById(88);

    expect(postRepository.findOne).toHaveBeenCalled();
    expect(postDetailService.toDetail).toHaveBeenCalledWith(
      expect.objectContaining({ id: 88 }),
    );
    expect(redisService.set).toHaveBeenCalledWith(
      'post:detail:v2:88',
      JSON.stringify({
        id: 88,
        title: 'Detailed post',
        category_name: 'General',
        author_mindauth_id: 1234,
      }),
      300,
    );
    expect(result).toMatchObject({
      id: 88,
      title: 'Detailed post',
    });
  });

  it('maps reply DTOs with author metadata for post detail pages', async () => {
    const { service, replyRepository, postDetailService } = createService({
      replyRepository: {
        findAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 6,
              post_id: 88,
              user_id: 5,
              status: 'published',
            },
          ],
          1,
        ]),
      },
      postDetailService: {
        toReplies: jest.fn().mockResolvedValue([
          {
            id: 6,
            post_id: 88,
            author_mindauth_id: 7788,
          },
        ]),
      },
    });

    const result = await service.getReplies(88, 20, 2);

    expect(replyRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { post_id: 88, status: expect.any(Object) },
        skip: 20,
        take: 20,
      }),
    );
    expect(postDetailService.toReplies).toHaveBeenCalledWith([
      expect.objectContaining({ id: 6 }),
    ]);
    expect(result).toMatchObject({
      data: [
        {
          id: 6,
          post_id: 88,
          author_mindauth_id: 7788,
        },
      ],
      total: 1,
      page: 2,
      limit: 20,
      totalPages: 1,
    });
  });

  it('maps search results into public summaries', async () => {
    const { service, postRepository, postSummaryService } = createService({
      postRepository: {
        find: jest.fn().mockResolvedValue([
          {
            id: 31,
            title: 'Searchable post',
          },
        ]),
      },
      postSummaryService: {
        toSummaryList: jest.fn().mockResolvedValue([
          {
            id: 31,
            title: 'Searchable post',
            excerpt: 'search summary',
          },
        ]),
      },
    });

    const result = await service.search('hello', 15);

    expect(postRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          { title: expect.any(Object), status: 'published' },
          { content: expect.any(Object), status: 'published' },
        ],
        take: 15,
      }),
    );
    expect(postSummaryService.toSummaryList).toHaveBeenCalledWith([
      expect.objectContaining({ id: 31 }),
    ]);
    expect(result).toMatchObject([
      {
        id: 31,
        title: 'Searchable post',
        excerpt: 'search summary',
      },
    ]);
  });

  it('maps trending and pinned public reads into summaries', async () => {
    const { service, postRepository, postSummaryService } = createService({
      postRepository: {
        find: jest.fn()
          .mockResolvedValueOnce([
            {
              id: 41,
              title: 'Trending post',
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 52,
              title: 'Pinned post',
            },
          ]),
      },
      postSummaryService: {
        toSummaryList: jest.fn()
          .mockResolvedValueOnce([
            {
              id: 41,
              title: 'Trending post',
              excerpt: 'trending summary',
            },
          ])
          .mockResolvedValueOnce([
            {
              id: 52,
              title: 'Pinned post',
              excerpt: 'pinned summary',
            },
          ]),
      },
    });

    const trending = await service.getTrending(5);
    const pinned = await service.getPinned(9);

    expect(postRepository.find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'published',
          created_at: expect.any(Object),
        }),
        order: { view_count: 'DESC' },
        take: 5,
      }),
    );
    expect(postRepository.find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { is_pinned: 1, status: 'published', category_id: 9 },
        order: { created_at: 'DESC' },
      }),
    );
    expect(postSummaryService.toSummaryList).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({ id: 41 })],
    );
    expect(postSummaryService.toSummaryList).toHaveBeenNthCalledWith(
      2,
      [expect.objectContaining({ id: 52 })],
    );
    expect(trending).toMatchObject([
      { id: 41, title: 'Trending post', excerpt: 'trending summary' },
    ]);
    expect(pinned).toMatchObject([
      { id: 52, title: 'Pinned post', excerpt: 'pinned summary' },
    ]);
  });
});

const decorator = () => () => undefined;

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
}));

jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/tag.entity', () => ({ Tag: class Tag {} }));
jest.mock('@entities/category.entity', () => ({ Category: class Category {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));

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

function createService(overrides: {
  postRepository?: Record<string, jest.Mock>;
  postSummaryService?: Record<string, jest.Mock>;
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

  const resourceRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(createResourceQueryBuilder([])),
  };
  const redisService = {
    get: jest.fn(),
    set: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
  };

  const service = new SearchService(
    postRepository as any,
    {} as any,
    {} as any,
    {} as any,
    resourceRepository as any,
    redisService as any,
    postSummaryService as any,
  );

  return {
    service,
    postRepository,
    postSummaryService,
    queryBuilder,
    resourceRepository,
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
      'p.server_id',
      'p.post_type',
      'p.title',
      'p.content',
      'p.status',
      'p.is_pinned',
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
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'MATCH(p.title, p.content) AGAINST(:query IN NATURAL LANGUAGE MODE)',
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

  it('does not expose resources in a disabled category through search', async () => {
    const { service, resourceRepository } = createService();

    await service.searchResources('guide');

    const queryBuilder = resourceRepository.createQueryBuilder.mock.results[0].value;

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(category.id IS NULL OR category.is_active = :categoryActive)',
      { categoryActive: 1 },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'MATCH(r.title, r.description) AGAINST(:query IN NATURAL LANGUAGE MODE)',
      { query: 'guide' },
    );
  });
});

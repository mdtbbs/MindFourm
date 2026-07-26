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

jest.mock('@entities/tag.entity', () => ({ Tag: class Tag {} }));
jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/post-tag.entity', () => ({ PostTag: class PostTag {} }));

import { TagsService } from './tags.service';

function createQueryBuilder(posts: any[], total: number) {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([posts, total]),
  };
}

function createService(overrides: {
  tagRepository?: Record<string, jest.Mock>;
  postRepository?: Record<string, jest.Mock>;
  postSummaryService?: Record<string, jest.Mock>;
} = {}) {
  const queryBuilder = createQueryBuilder(
    [
      {
        id: 21,
        title: 'Tagged post',
      },
    ],
    21,
  );

  const tagRepository = {
    createQueryBuilder: jest.fn(),
    findOne: jest.fn().mockResolvedValue({
      id: 4,
      name: 'Guides',
      slug: 'guides',
    }),
    ...overrides.tagRepository,
  };
  const postRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    ...overrides.postRepository,
  };
  const postSummaryService = {
    toSummaryList: jest.fn().mockResolvedValue([
      {
        id: 21,
        title: 'Tagged post',
        excerpt: 'summary',
      },
    ]),
    ...overrides.postSummaryService,
  };

  const service = new TagsService(
    tagRepository as any,
    postRepository as any,
    {} as any,
    postSummaryService as any,
  );

  return {
    service,
    tagRepository,
    postRepository,
    postSummaryService,
    queryBuilder,
  };
}

describe('TagsService', () => {
  it('returns tag posts with the same flat data shape as post lists', async () => {
    const { service, queryBuilder, postSummaryService } = createService();

    const result = await service.getPostsByTagSlug('guides', 2, 10);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('post.status = :status', {
      status: 'published',
    });
    expect(postSummaryService.toSummaryList).toHaveBeenCalledWith([
      expect.objectContaining({ id: 21 }),
    ]);
    expect(result).toMatchObject({
      data: [
        {
          id: 21,
          title: 'Tagged post',
          excerpt: 'summary',
        },
      ],
      total: 21,
      page: 2,
      limit: 10,
      totalPages: 3,
    });
    expect(result).not.toHaveProperty('posts');
  });
});

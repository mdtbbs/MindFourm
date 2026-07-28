const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  In: (value: unknown) => ({ __op: 'In', value }),
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
jest.mock('@entities/post-tag.entity', () => ({ PostTag: class PostTag {} }));
jest.mock('@entities/reply.entity', () => ({ Reply: class Reply {} }));

import { PostSummaryService } from './post-summary.service';

function createService(overrides: {
  postTagRepository?: Record<string, jest.Mock>;
  replyRepository?: Record<string, jest.Mock>;
} = {}) {
  const postTagRepository = {
    find: jest.fn().mockResolvedValue([
      {
        post_id: 1,
        tag: {
          id: 11,
          name: 'Guide',
          slug: 'guide',
          created_at: new Date('2026-07-09T10:00:00.000Z'),
        },
      },
    ]),
    ...overrides.postTagRepository,
  };

  const getRawMany = jest.fn().mockResolvedValue([
    { post_id: '1', count: '2' },
  ]);
  const queryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany,
  };
  const replyRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    ...overrides.replyRepository,
  };

  const service = new PostSummaryService(
    postTagRepository as any,
    replyRepository as any,
  );

  return {
    service,
    postTagRepository,
    replyRepository,
    queryBuilder,
    getRawMany,
  };
}

describe('PostSummaryService', () => {
  it('maps posts into summary DTOs with excerpt, tags and reply counts', async () => {
    const { service, queryBuilder } = createService();

    const result = await service.toSummaryList([
      {
        id: 1,
        user_id: 7,
        category_id: 3,
        server_id: null,
        post_type: 'normal',
        slug: 'alpha-post',
        title: 'Alpha',
        content: '# Alpha\nThis is **content** with [link](https://example.com)',
        status: 'published',
        is_pinned: 1,
        view_count: 18,
        like_count: 5,
        created_at: new Date('2026-07-09T08:00:00.000Z'),
        updated_at: new Date('2026-07-09T08:30:00.000Z'),
        user: {
          id: 7,
          mindauth_id: 9001,
          username: 'Alice',
          avatar_url: '/uploads/avatars/alice.png',
          role: 'moderator',
        },
        category: {
          id: 3,
          name: 'Announcements',
          slug: 'announcements',
        },
      } as any,
    ]);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'reply.status IN (:...statuses)',
      { statuses: ['published'] },
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 1,
      title: 'Alpha',
      slug: 'alpha-post',
      excerpt: 'Alpha This is content with link',
      is_pinned: true,
      reply_count: 2,
      category_name: 'Announcements',
      category_slug: 'announcements',
      author_mindauth_id: 9001,
      author_role: 'moderator',
      author_name: 'Alice',
      author_avatar_url: '/uploads/avatars/alice.png',
      tags: [
        {
          id: 11,
          name: 'Guide',
          slug: 'guide',
        },
      ],
    });
    expect(result[0]).not.toHaveProperty('content');
    expect(result[0]).not.toHaveProperty('content_html');
  });

  it('returns an empty list without querying related repositories', async () => {
    const { service, postTagRepository, replyRepository } = createService();

    const result = await service.toSummaryList([]);

    expect(result).toEqual([]);
    expect(postTagRepository.find).not.toHaveBeenCalled();
    expect(replyRepository.createQueryBuilder).not.toHaveBeenCalled();
  });
});

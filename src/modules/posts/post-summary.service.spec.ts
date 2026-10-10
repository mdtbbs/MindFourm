const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({ Injectable: decorator }));

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
  relationRepository?: Record<string, jest.Mock>;
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
  const relationRepository = { find: jest.fn().mockResolvedValue([]), ...overrides.relationRepository };

  const service = new PostSummaryService(
    postTagRepository as any,
    replyRepository as any,
    relationRepository as any,
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
        content_language: 'ja',
        content: '# Alpha\nThis is **content** with [link](https://example.com)',
        status: 'published',
        is_pinned: 1,
        view_count: 18,
        like_count: 5,
        created_at: new Date('2026-07-09T08:00:00.000Z'),
        last_activity_at: new Date('2026-07-10T08:00:00.000Z'),
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
      content_language: 'ja',
      slug: 'alpha-post',
      // The fixture body repeats its own title, so the excerpt drops the echo.
      excerpt: 'This is content with link',
      is_pinned: true,
      reply_count: 2,
      last_activity_at: new Date('2026-07-10T08:00:00.000Z'),
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
    expect(queryBuilder.addSelect).toHaveBeenCalledWith('COUNT(reply.id)', 'count');
    expect(queryBuilder.addSelect).not.toHaveBeenCalledWith('MAX(reply.created_at)', 'last_activity_at');
  });

  it('returns an empty list without querying related repositories', async () => {
    const { service, postTagRepository, replyRepository } = createService();

    const result = await service.toSummaryList([]);

    expect(result).toEqual([]);
    expect(postTagRepository.find).not.toHaveBeenCalled();
    expect(replyRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('decodes legacy escaped HTML and JSON newlines before building an excerpt', () => {
    const { service } = createService();
    expect(service.buildExcerpt('&lt;p&gt;第一行\\n第二行&lt;/p&gt;')).toBe('第一行 第二行');
  });

  it('strips a body that only restates the title', () => {
    const { service } = createService();

    // The most common shape: title repeated as the opening line, then the body.
    expect(service.buildExcerpt('我的第一个 Mod\\n\\n这里是一些说明文字', 120, '我的第一个 Mod')).toBe('这里是一些说明文字');
    // Punctuation and list markers between title and body must not leak through.
    expect(service.buildExcerpt('更新公告：新版本已上线', 120, '更新公告')).toBe('新版本已上线');
    // A body that never repeats the title is untouched.
    expect(service.buildExcerpt('正文与标题无关', 120, '更新公告')).toBe('正文与标题无关');
    // A title-only body must not collapse to an empty excerpt.
    expect(service.buildExcerpt('更新公告', 120, '更新公告')).toBe('更新公告');
  });
});

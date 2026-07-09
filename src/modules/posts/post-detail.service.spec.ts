import { PostDetailService } from './post-detail.service';

function createService(overrides: {
  postTagRepository?: Record<string, jest.Mock>;
} = {}) {
  const postTagRepository = {
    find: jest.fn().mockResolvedValue([
      {
        tag: {
          id: 9,
          name: 'News',
          slug: 'news',
          created_at: new Date('2026-07-09T10:00:00.000Z'),
        },
      },
    ]),
    ...overrides.postTagRepository,
  };
  const service = new PostDetailService(
    postTagRepository as any,
  );

  return {
    service,
    postTagRepository,
  };
}

describe('PostDetailService', () => {
  it('maps a post into the public detail DTO with full content and author metadata', async () => {
    const { service } = createService();

    const result = await service.toDetail({
      id: 42,
      user_id: 7,
      category_id: 3,
      server_id: null,
      required_group_id: null,
      post_type: 'normal',
      title: 'Hello',
      content: '# Hello world',
      content_html: '<h1>Hello world</h1>',
      status: 'published',
      is_pinned: 1,
      view_count: 99,
      like_count: 4,
      created_at: new Date('2026-07-09T08:00:00.000Z'),
      updated_at: new Date('2026-07-09T08:30:00.000Z'),
      user: {
        mindauth_id: 8001,
        role: 'moderator',
      },
      category: {
        name: 'General',
        slug: 'general',
      },
    } as any);

    expect(result).toMatchObject({
      id: 42,
      content: '# Hello world',
      content_html: '<h1>Hello world</h1>',
      category_name: 'General',
      category_slug: 'general',
      author_mindauth_id: 8001,
      author_role: 'moderator',
      tags: [
        {
          id: 9,
          name: 'News',
          slug: 'news',
        },
      ],
    });
  });
});

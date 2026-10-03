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
  In: jest.fn((values) => ({ _type: 'in', _value: values })),
  IsNull: jest.fn(() => ({ _type: 'isNull' })),
}));

jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/post-tag.entity', () => ({ PostTag: class PostTag {} }));
jest.mock('@entities/reply.entity', () => ({ Reply: class Reply {} }));
jest.mock('@entities/resource.entity', () => ({ Resource: class Resource {} }));

import { PostDetailService } from './post-detail.service';

function createService(overrides: {
  postTagRepository?: Record<string, jest.Mock>;
  relationRepository?: Record<string, jest.Mock>;
  resourceRepository?: Record<string, jest.Mock>;
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
  const relationRepository = { findOne: jest.fn().mockResolvedValue(null), ...overrides.relationRepository };
  const resourceRepository = { findOne: jest.fn().mockResolvedValue(null), ...overrides.resourceRepository };
  const service = new PostDetailService(
    postTagRepository as any,
    relationRepository as any,
    resourceRepository as any,
  );

  return {
    service,
    postTagRepository,
    resourceRepository,
  };
}

describe('PostDetailService', () => {
  it('maps a post into the public detail DTO with full content and author metadata', async () => {
    const { service, resourceRepository } = createService();

    const result = await service.toDetail({
      id: 42,
      user_id: 7,
      category_id: 3,
      server_id: null,
      required_group_id: null,
      post_type: 'normal',
      slug: 'hello-world',
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
        username: 'Alice',
        avatar_url: '/uploads/avatars/alice.png',
        role: 'moderator',
      },
      category: {
        name: 'General',
        slug: 'general',
      },
    } as any);

    expect(result).toMatchObject({
      id: 42,
      slug: 'hello-world',
      content: '# Hello world',
      content_html: '<h1>Hello world</h1>',
      category_name: 'General',
      category_slug: 'general',
      author_mindauth_id: 8001,
      author_role: 'moderator',
      author_name: 'Alice',
      author_avatar_url: '/uploads/avatars/alice.png',
      prefix: null,
      tags: [
        {
          id: 9,
          name: 'News',
          slug: 'news',
        },
      ],
    });
    expect(result.resource_header).toBeNull();
    expect(resourceRepository.findOne).not.toHaveBeenCalled();
  });

  it('adds a live resource card to canonical discussion threads without changing the authored body', async () => {
    const { service, resourceRepository } = createService({
      resourceRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 18,
          title: 'Thorium Reactor',
          slug: 'thorium-reactor',
          resource_kind: 'schematic',
          status: 'published',
          version: '1.2.0',
          renderer_status: 'ready',
          user: { id: 7, username: 'Alice', avatar_url: '/uploads/alice.png' },
        }),
      },
    });

    const result = await service.toDetail({
      id: 501,
      post_type: 'resource_discussion',
      title: 'Discussion title',
      content: 'Author-written body stays intact.',
      user_id: 7,
      status: 'published',
    } as any);

    expect(resourceRepository.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.arrayContaining([
        expect.objectContaining({ discussion_thread_id: 501, is_public: 1 }),
      ]),
    }));
    expect(result).toMatchObject({
      title: 'Discussion title',
      content: 'Author-written body stays intact.',
      resource_header: {
        id: 18,
        title: 'Thorium Reactor',
        resource_kind: 'schematic',
        version: '1.2.0',
        preview_url: '/api/resources/18/preview',
        resource_url: '/resources/18-thorium-reactor',
        download_url: '/api/resources/18/download',
        author: { id: 7, username: 'Alice', avatar_url: '/uploads/alice.png' },
      },
    });
  });
});

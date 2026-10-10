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

jest.mock('@entities/index', () => ({
  Post: class Post {},
  Category: class Category {},
  Notification: class Notification {},
  ContentRelation: class ContentRelation {},
}));

import { AutoPostService } from './auto-post.service';

const BASE_DATA = {
  server_name: 'MindCraft',
  server_id: 123,
  description: 'Fresh survival server',
};

function createService(options: {
  link?: any;
  post?: any;
  category?: any;
  fallbackCategory?: any;
} = {}) {
  const postRepo = {
    findOne: jest.fn().mockResolvedValue(options.post ?? null),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 77, ...v })),
  };
  const categoryRepo = {
    findOne: jest.fn(async (opts: any) =>
      opts.where ? (options.category ?? null) : (options.fallbackCategory ?? null)),
  };
  const notificationRepo = {
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 9, ...v })),
  };
  const relationRepo = {
    findOne: jest.fn().mockResolvedValue(options.link ?? null),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 5, ...v })),
  };

  const service = new AutoPostService(
    postRepo as any,
    categoryRepo as any,
    notificationRepo as any,
    relationRepo as any,
  );

  return { service, postRepo, categoryRepo, notificationRepo, relationRepo };
}

describe('AutoPostService.createServerAnnouncement idempotency', () => {
  it('returns the existing announcement without creating anything new', async () => {
    const existingPost = { id: 42, post_type: 'server_announcement', title: 'Server Approved: MindCraft' };
    const { service, postRepo, categoryRepo, notificationRepo, relationRepo } = createService({
      link: { id: 5, source_id: 42 },
      post: existingPost,
    });

    await expect(service.createServerAnnouncement({ ...BASE_DATA, user_id: 7 })).resolves.toEqual({
      post: existingPost,
      created: false,
    });

    expect(postRepo.create).not.toHaveBeenCalled();
    expect(postRepo.save).not.toHaveBeenCalled();
    expect(relationRepo.create).not.toHaveBeenCalled();
    expect(relationRepo.save).not.toHaveBeenCalled();
    expect(categoryRepo.findOne).not.toHaveBeenCalled();
    expect(notificationRepo.save).not.toHaveBeenCalled();
  });

  it('looks the relation up by server id and re-checks the post type', async () => {
    const existingPost = { id: 42, post_type: 'server_announcement' };
    const { service, postRepo, relationRepo } = createService({
      link: { id: 5, source_id: 42 },
      post: existingPost,
    });

    await service.createServerAnnouncement(BASE_DATA);

    expect(relationRepo.findOne).toHaveBeenCalledWith({
      where: {
        source_type: 'post',
        target_type: 'game_server',
        target_id: '123',
        relation_type: 'related',
      },
    });
    expect(postRepo.findOne).toHaveBeenCalledWith({
      where: { id: 42, post_type: 'server_announcement' },
    });
  });

  it('creates a fresh announcement when the relation exists but the post is gone', async () => {
    const { service, postRepo } = createService({ link: { id: 5, source_id: 42 }, post: null });

    const result = await service.createServerAnnouncement(BASE_DATA);

    expect(result.created).toBe(true);
    expect(postRepo.save).toHaveBeenCalledTimes(1);
  });
});

describe('AutoPostService.createServerAnnouncement category resolution', () => {
  it('uses the requested category slug', async () => {
    const { service, categoryRepo, postRepo } = createService({
      category: { id: 11, slug: 'game-servers' },
    });

    await service.createServerAnnouncement({ ...BASE_DATA, category_slug: 'game-servers' });

    expect(categoryRepo.findOne).toHaveBeenCalledTimes(1);
    expect(categoryRepo.findOne).toHaveBeenCalledWith({ where: { slug: 'game-servers' } });
    expect(postRepo.create).toHaveBeenCalledWith(expect.objectContaining({ category_id: 11 }));
  });

  it('falls back to the announcements slug when none is given', async () => {
    const { service, categoryRepo } = createService({ category: { id: 3, slug: 'announcements' } });

    await service.createServerAnnouncement(BASE_DATA);

    expect(categoryRepo.findOne).toHaveBeenCalledWith({ where: { slug: 'announcements' } });
  });

  it('falls back to the lowest-id category when the slug misses', async () => {
    const { service, categoryRepo, postRepo } = createService({
      category: null,
      fallbackCategory: { id: 2, slug: 'general' },
    });

    await service.createServerAnnouncement({ ...BASE_DATA, category_slug: 'nope' });

    expect(categoryRepo.findOne).toHaveBeenNthCalledWith(1, { where: { slug: 'nope' } });
    expect(categoryRepo.findOne).toHaveBeenNthCalledWith(2, { order: { id: 'ASC' } });
    expect(postRepo.create).toHaveBeenCalledWith(expect.objectContaining({ category_id: 2 }));
  });

  it('leaves category_id undefined when no category exists at all', async () => {
    const { service, categoryRepo, postRepo } = createService({ category: null, fallbackCategory: null });

    await service.createServerAnnouncement(BASE_DATA);

    expect(categoryRepo.findOne).toHaveBeenCalledTimes(2);
    expect(postRepo.create).toHaveBeenCalledTimes(1);
    expect(postRepo.create.mock.calls[0][0].category_id).toBeUndefined();
  });
});

describe('AutoPostService.createServerAnnouncement post and relation persistence', () => {
  it('creates a published server_announcement post with rendered html', async () => {
    const { service, postRepo } = createService({ category: { id: 11, slug: 'announcements' } });

    const result = await service.createServerAnnouncement(BASE_DATA);

    const payload = postRepo.create.mock.calls[0][0];
    expect(payload.user_id).toBe(1);
    expect(payload.post_type).toBe('server_announcement');
    expect(payload.status).toBe('published');
    expect(payload.title).toBe('Server Approved: MindCraft');
    expect(payload.content).toContain('Fresh survival server');
    expect(payload.content_html).toContain('<h2');
    expect(payload.content_html).toContain('MindCraft');
    expect(payload.content_html).toContain('Fresh survival server');
    expect(payload.content_html).toMatch(/<em>This server has been approved/);
    expect(result).toEqual({ post: { id: 77, ...payload }, created: true });
  });

  it('records the server relation against the saved post id', async () => {
    const { service, relationRepo } = createService();

    await service.createServerAnnouncement(BASE_DATA);

    expect(relationRepo.create).toHaveBeenCalledWith({
      source_type: 'post',
      source_id: 77,
      target_type: 'game_server',
      target_id: '123',
      relation_type: 'related',
    });
    expect(relationRepo.save).toHaveBeenCalledWith(expect.objectContaining({ source_id: 77 }));
  });
});

describe('AutoPostService.createServerAnnouncement notification', () => {
  it('notifies the applicant when user_id is provided', async () => {
    const { service, notificationRepo } = createService();

    await service.createServerAnnouncement({ ...BASE_DATA, user_id: 7 });

    expect(notificationRepo.create).toHaveBeenCalledWith({
      user_id: 7,
      type: 'server_approved',
      post_id: 77,
      is_read: 0,
    });
    expect(notificationRepo.save).toHaveBeenCalledTimes(1);
  });

  it('does not notify when user_id is missing', async () => {
    const { service, notificationRepo } = createService();

    await service.createServerAnnouncement(BASE_DATA);

    expect(notificationRepo.create).not.toHaveBeenCalled();
    expect(notificationRepo.save).not.toHaveBeenCalled();
  });

  it('does not notify for user_id 0', async () => {
    const { service, notificationRepo } = createService();

    await service.createServerAnnouncement({ ...BASE_DATA, user_id: 0 });

    expect(notificationRepo.create).not.toHaveBeenCalled();
  });
});

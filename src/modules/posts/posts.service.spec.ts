const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
  Brackets: class Brackets {},
  In: (value: unknown) => ({ __op: 'In', value }),
  IsNull: () => ({ __op: 'IsNull' }),
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
jest.mock('@entities/post-revision.entity', () => ({ PostRevision: class PostRevision {} }));
jest.mock('@common/utils/markdown.util', () => ({ parseMarkdown: (value: string) => value }));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PostsService } from './posts.service';

/**
 * A transaction `EntityManager` whose `findOne` answers per entity class.
 *
 * The mocked entities are distinguishable only by their class name, so the fixtures
 * are keyed by name rather than by identity.
 */
function createManagerMock(rows: Record<string, unknown> = {}) {
  return {
    findOne: jest.fn(async (entity: { name: string }) => rows[entity.name] ?? null),
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn(async (_entity: unknown, value: unknown) => value),
    create: jest.fn((_entity: unknown, value: unknown) => value),
  };
}

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
  notificationsService?: Record<string, jest.Mock>;
  manager?: ReturnType<typeof createManagerMock>;
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

  const notificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
    notifyMentionedUsers: jest.fn().mockResolvedValue(undefined),
    ...overrides.notificationsService,
  };
  const manager = overrides.manager ?? createManagerMock();
  const dataSource = {
    transaction: jest.fn(async (work: (m: unknown) => Promise<unknown>) => work(manager)),
  };

  const service = new PostsService(
    postRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    replyRepository as any,
    dataSource as any,
    redisService as any,
    {} as any,
    groupsService as any,
    // Resolves rather than returning undefined: the post hooks are fired and
    // `.catch()`ed without being awaited, so a non-promise return crashes the caller.
    { execute: jest.fn().mockResolvedValue(undefined) } as any,
    notificationsService as any,
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
    notificationsService,
    dataSource,
    manager,
    listQueryBuilder,
  };
}

const STAFF = { id: 99, role: 'moderator' };
const AUTHOR = { id: 7, role: 'user' };
const STRANGER = { id: 8, role: 'user' };

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

  it('orders discussion lists by the persisted activity timestamp', async () => {
    const { service, listQueryBuilder } = createService();

    await service.findAll({ page: 1, limit: 30, sort: 'last_activity_at' });

    expect(listQueryBuilder.orderBy).toHaveBeenCalledWith(
      'post.last_activity_at',
      'DESC',
    );
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
      // v5: the cached shape gained category presentation metadata, so entries written by
      // the previous deploy must not be read back as if they had them.
      'post:detail:v5:88',
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

  it('paginates root replies only, so page numbers count threads rather than rows', async () => {
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
        find: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(4),
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

    // parent_reply_id IS NULL is what restricts the page to roots; without it a nested
    // reply could be paginated away from the parent it belongs to.
    expect(replyRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ post_id: 88, parent_reply_id: expect.any(Object) }),
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
      // `total` counts every reply because the UI shows it as "回复 (N)", while the page
      // count comes from the root total.
      total: 4,
      rootTotal: 1,
      page: 2,
      limit: 20,
      totalPages: 1,
    });
  });

  it('returns the descendants of the roots on the page, not just the roots', async () => {
    const roots = [{ id: 10, post_id: 88, user_id: 5, status: 'published' }];
    const children = [
      { id: 11, post_id: 88, user_id: 6, parent_reply_id: 10, status: 'published' },
    ];
    const grandchildren = [
      { id: 12, post_id: 88, user_id: 7, parent_reply_id: 11, status: 'published' },
    ];

    const find = jest
      .fn()
      .mockResolvedValueOnce(children)
      .mockResolvedValueOnce(grandchildren)
      .mockResolvedValue([]);

    const { service, postDetailService } = createService({
      replyRepository: {
        findAndCount: jest.fn().mockResolvedValue([roots, 1]),
        find,
        count: jest.fn().mockResolvedValue(3),
      },
      postDetailService: { toReplies: jest.fn().mockResolvedValue([]) },
    });

    await service.getReplies(88, 20, 1);

    // One query per level, each seeded with the previous level's ids, stopping as soon
    // as a level comes back empty.
    expect(find).toHaveBeenCalledTimes(3);
    expect(postDetailService.toReplies).toHaveBeenCalledWith([
      ...roots,
      ...children,
      ...grandchildren,
    ]);
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

describe('PostsService.setLocked', () => {
  it('writes is_locked=1 and drops the cached detail so readers stop seeing an unlocked post', async () => {
    const { service, postRepository, redisService } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 88, is_locked: 0 }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    });

    const result = await service.setLocked(88, true, STAFF);

    expect(postRepository.update).toHaveBeenCalledWith(88, { is_locked: 1 });
    expect(redisService.del).toHaveBeenCalledWith('post:detail:v5:88');
    // Just the flag: `pin` and `move` return the reloaded entity joined to `user`, which
    // carries the author's email out with it.
    expect(result).toEqual({ id: 88, is_locked: true });
  });

  it('writes is_locked=0 when unlocking', async () => {
    const { service, postRepository } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 88, is_locked: 1 }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    });

    await service.setLocked(88, false, STAFF);

    expect(postRepository.update).toHaveBeenCalledWith(88, { is_locked: 0 });
  });

  it('refuses a non-staff caller even though the route guard would have allowed the request through', async () => {
    const { service, postRepository } = createService({
      postRepository: { findOne: jest.fn().mockResolvedValue({ id: 88 }) },
    });

    await expect(service.setLocked(88, true, AUTHOR)).rejects.toThrow(ForbiddenException);
    expect(postRepository.update).not.toHaveBeenCalled();
  });

  it('accepts super_admin, which a literal [admin, moderator] check would have rejected', async () => {
    const { service, postRepository } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 88 }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    });

    await service.setLocked(88, true, { id: 1, role: 'super_admin' });

    expect(postRepository.update).toHaveBeenCalledWith(88, { is_locked: 1 });
  });

  it('reports a missing post as 404 instead of silently updating nothing', async () => {
    const { service } = createService({
      postRepository: { findOne: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.setLocked(404, true, STAFF)).rejects.toThrow(NotFoundException);
  });
});

describe('PostsService.setBestReply', () => {
  const POST = { id: 88, user_id: AUTHOR.id, best_reply_id: null };

  it('lets the post author mark a reply and notifies the reply author', async () => {
    const manager = createManagerMock({
      Post: POST,
      Reply: { id: 5, user_id: 42, content: 'the answer' },
    });
    const { service, notificationsService, redisService } = createService({ manager });

    const result = await service.setBestReply(88, 5, AUTHOR);

    expect(manager.update).toHaveBeenCalledWith(expect.anything(), 88, { best_reply_id: 5 });
    expect(result).toEqual({ id: 88, best_reply_id: 5 });
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 42,
        type: 'best_answer',
        actor_id: AUTHOR.id,
        post_id: 88,
        reply_id: 5,
      }),
    );
    expect(redisService.del).toHaveBeenCalledWith('post:detail:v5:88');
  });

  it('lets a moderator mark a reply on someone else s post', async () => {
    const manager = createManagerMock({
      Post: POST,
      Reply: { id: 5, user_id: 42, content: 'the answer' },
    });
    const { service } = createService({ manager });

    await expect(service.setBestReply(88, 5, STAFF)).resolves.toEqual({
      id: 88,
      best_reply_id: 5,
    });
  });

  it('refuses a caller who is neither the post author nor staff', async () => {
    const manager = createManagerMock({ Post: POST });
    const { service } = createService({ manager });

    await expect(service.setBestReply(88, 5, STRANGER)).rejects.toThrow(ForbiddenException);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('rejects a reply that belongs to a different post, so no reply id can be pinned to any post', async () => {
    // The service scopes the lookup by post_id, so a foreign reply simply does not
    // resolve — which is what the null fixture stands in for here.
    const manager = createManagerMock({ Post: POST, Reply: null });
    const { service } = createService({ manager });

    await expect(service.setBestReply(88, 999, AUTHOR)).rejects.toThrow(BadRequestException);
    expect(manager.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Reply' }),
      expect.objectContaining({
        where: expect.objectContaining({ id: 999, post_id: 88 }),
      }),
    );
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('clears the mark when reply_id is null, without looking up or notifying anybody', async () => {
    const manager = createManagerMock({ Post: { ...POST, best_reply_id: 5 } });
    const { service, notificationsService } = createService({ manager });

    const result = await service.setBestReply(88, null, AUTHOR);

    expect(manager.update).toHaveBeenCalledWith(expect.anything(), 88, { best_reply_id: null });
    expect(result).toEqual({ id: 88, best_reply_id: null });
    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('sends no notification when the marker wrote the reply themselves', async () => {
    const manager = createManagerMock({
      Post: POST,
      Reply: { id: 5, user_id: AUTHOR.id, content: 'answering myself' },
    });
    const { service, notificationsService } = createService({ manager });

    await service.setBestReply(88, 5, AUTHOR);

    expect(notificationsService.create).not.toHaveBeenCalled();
  });

  it('reports a missing post as 404', async () => {
    const manager = createManagerMock({ Post: null });
    const { service } = createService({ manager });

    await expect(service.setBestReply(404, 5, AUTHOR)).rejects.toThrow(NotFoundException);
  });
});

describe('PostsService.update revision history', () => {
  const EXISTING = {
    id: 88,
    user_id: AUTHOR.id,
    title: 'Original title',
    content: 'Original body',
    content_html: '<p>Original body</p>',
    category_id: 3,
    status: 'published',
  };

  it('snapshots the pre-edit title and body when the content changes', async () => {
    const manager = createManagerMock({ Post: EXISTING, Category: { id: 3 } });
    const { service } = createService({ manager });

    await service.update(88, { content: 'Rewritten body' }, AUTHOR.id, AUTHOR.role);

    expect(manager.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'PostRevision' }),
      {
        post_id: 88,
        editor_id: AUTHOR.id,
        // The *old* values: the revision list plus the post's current content is the
        // full history.
        title: 'Original title',
        content: 'Original body',
      },
    );
  });

  it('records a revision for a title-only edit and stamps edited_at', async () => {
    const manager = createManagerMock({ Post: EXISTING, Category: { id: 3 } });
    const { service } = createService({ manager });

    await service.update(88, { title: 'New title' }, AUTHOR.id, AUTHOR.role);

    expect(manager.insert).toHaveBeenCalledTimes(1);
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      88,
      expect.objectContaining({ title: 'New title', edited_at: expect.any(Date) }),
    );
  });

  it('records nothing for a category-only change, which leaves title and body untouched', async () => {
    const manager = createManagerMock({ Post: EXISTING, Category: { id: 9 } });
    const { service } = createService({ manager });

    await service.update(88, { category_id: 9 }, AUTHOR.id, AUTHOR.role);

    expect(manager.insert).not.toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      88,
      expect.not.objectContaining({ edited_at: expect.anything() }),
    );
  });

  it('records nothing when the submitted title and body are identical to the stored ones', async () => {
    const manager = createManagerMock({ Post: EXISTING, Category: { id: 3 } });
    const { service } = createService({ manager });

    await service.update(
      88,
      { title: EXISTING.title, content: EXISTING.content },
      AUTHOR.id,
      AUTHOR.role,
    );

    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('writes the revision inside the same transaction as the post update', async () => {
    const manager = createManagerMock({ Post: EXISTING, Category: { id: 3 } });
    const { service, dataSource } = createService({ manager });

    await service.update(88, { content: 'Rewritten body' }, AUTHOR.id, AUTHOR.role);

    // Both writes went through the manager the transaction callback was handed, so a
    // rollback cannot leave a revision claiming an edit that never landed.
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.insert).toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalled();
  });

  it('refuses an edit from a caller who is neither the author nor staff, before writing a revision', async () => {
    const manager = createManagerMock({ Post: EXISTING });
    const { service } = createService({ manager });

    await expect(
      service.update(88, { content: 'vandalised' }, STRANGER.id, STRANGER.role),
    ).rejects.toThrow(ForbiddenException);
    expect(manager.insert).not.toHaveBeenCalled();
  });
});

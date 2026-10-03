const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

// `replies.service.ts` reaches the whole entity index through the notifications and
// settings services it depends on, so every decorator those entities use has to be
// stubbed — not just the ones the reply and post entities need.
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

jest.mock('@entities/reply.entity', () => ({ Reply: class Reply {} }));
jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));
jest.mock('@common/utils/markdown.util', () => ({ parseMarkdown: (value: string) => value, sanitize: (value: string) => value }));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RepliesService } from './replies.service';

const REPLIER_ID = 42;
const POST_AUTHOR_ID = 7;

const OPEN_POST = {
  id: 88,
  user_id: POST_AUTHOR_ID,
  status: 'published',
  is_locked: 0,
};

function createService(overrides: { post?: unknown; requiresApproval?: boolean } = {}) {
  const replyRepository = {
    create: jest.fn((value: Record<string, unknown>) => ({ id: 501, ...value })),
    save: jest.fn(async (value: Record<string, unknown>) => value),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  };
  const postRepository = {
    findOne: jest.fn().mockResolvedValue(
      overrides.post === undefined ? OPEN_POST : overrides.post,
    ),
  };
  const userRepository = {
    findOne: jest.fn().mockResolvedValue({ id: REPLIER_ID, username: 'replier' }),
  };
  const notificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
    notifyMentionedUsers: jest.fn().mockResolvedValue(undefined),
    notifyMentionedUserIds: jest.fn().mockResolvedValue(undefined),
  };
  const adminNotificationsService = {
    publishModerationPending: jest.fn().mockResolvedValue(undefined),
  };
  // Resolves rather than returning undefined: `reply.created` is fired and `.catch()`ed
  // without being awaited, so a non-promise return would crash the caller.
  const eventBus = {
    execute: jest.fn(async (_event: string, payload: unknown) => payload),
  };
  const pointsService = { awardPoints: jest.fn().mockResolvedValue(undefined) };
  const settingsService = {
    getBoolean: jest.fn().mockResolvedValue(overrides.requiresApproval ?? false),
  };
  const redisService = {
    del: jest.fn().mockResolvedValue(0),
  };
  const postActivityService = {
    markPostActive: jest.fn().mockResolvedValue(undefined),
    recalculatePostActivity: jest.fn().mockResolvedValue(undefined),
  };

  const service = new RepliesService(
    replyRepository as any,
    postRepository as any,
    userRepository as any,
    notificationsService as any,
    adminNotificationsService as any,
    eventBus as any,
    pointsService as any,
    settingsService as any,
    redisService as any,
    postActivityService as any,
  );

  return {
    service,
    replyRepository,
    postRepository,
    notificationsService,
    pointsService,
    settingsService,
    redisService,
    postActivityService,
  };
}

describe('RepliesService.createReplyForPost', () => {
  it('refuses to write a reply to a locked post', async () => {
    // The lock is enforced in the service, not by hiding the composer: this is the only
    // path that writes a reply, so it is the only place the lock can actually hold.
    const { service, replyRepository } = createService({
      post: { ...OPEN_POST, is_locked: 1 },
    });

    await expect(
      service.createReplyForPost(88, { content: 'let me in' }, REPLIER_ID),
    ).rejects.toThrow(ForbiddenException);
    expect(replyRepository.save).not.toHaveBeenCalled();
  });

  it('refuses a reply to a locked post from a moderator too, because a lock is about the thread', async () => {
    // `createReplyForPost` is handed a user id and no role, so there is no staff
    // exemption to apply — a moderator unlocks the thread first, which leaves an
    // operation-log entry saying so.
    const { service, replyRepository } = createService({
      post: { ...OPEN_POST, is_locked: 1 },
    });

    await expect(
      service.createReplyForPost(88, { content: 'moderator note' }, 99),
    ).rejects.toThrow(ForbiddenException);
    expect(replyRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a reply to a locked post before checking the parent reply, so no work is wasted', async () => {
    const { service, replyRepository } = createService({
      post: { ...OPEN_POST, is_locked: 1 },
    });

    await expect(
      service.createReplyForPost(88, { content: 'nested', parent_reply_id: 5 }, REPLIER_ID),
    ).rejects.toThrow(ForbiddenException);
    expect(replyRepository.findOne).not.toHaveBeenCalled();
  });

  it('writes the reply when the post is unlocked', async () => {
    const { service, replyRepository, redisService, postActivityService } = createService();

    const reply = await service.createReplyForPost(88, { content: 'hello' }, REPLIER_ID);

    expect(replyRepository.save).toHaveBeenCalledTimes(1);
    expect(redisService.del).toHaveBeenCalledWith('post:detail:v6:88');
    expect(postActivityService.markPostActive).toHaveBeenCalledWith(88, expect.any(Date));
    expect(reply).toMatchObject({ post_id: 88, user_id: REPLIER_ID, status: 'published' });
  });

  it('persists validated Tiptap JSON and its safe HTML/Markdown projections', async () => {
    const { service, replyRepository } = createService();
    const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'rich reply', marks: [{ type: 'bold' }] }] }] };

    await service.createReplyForPost(88, { content_json: document } as any, REPLIER_ID);

    expect(replyRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      content: '**rich reply**',
      content_json: document,
      content_html: '<p><strong>rich reply</strong></p>',
    }));
  });

  it('notifies the post author about a published reply from somebody else', async () => {
    const { service, notificationsService } = createService();

    await service.createReplyForPost(88, { content: 'hello' }, REPLIER_ID);

    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: POST_AUTHOR_ID, type: 'reply', post_id: 88 }),
    );
  });

  it('recalculates activity only when a visible reply is deleted', async () => {
    const { service, replyRepository, postActivityService } = createService();
    replyRepository.findOne.mockResolvedValue({
      id: 501,
      post_id: 88,
      user_id: REPLIER_ID,
      status: 'published',
    });

    await service.softDelete(501, REPLIER_ID);

    expect(postActivityService.recalculatePostActivity).toHaveBeenCalledWith(88);
  });

  it('still refuses a reply to an unpublished post', async () => {
    const { service } = createService({ post: { ...OPEN_POST, status: 'pending' } });

    await expect(
      service.createReplyForPost(88, { content: 'hello' }, REPLIER_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  it('reports a missing post as 404', async () => {
    const { service } = createService({ post: null });

    await expect(
      service.createReplyForPost(404, { content: 'hello' }, REPLIER_ID),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('Reply publication durability and privacy', () => {
  it('writes the reply and its event in the same transaction and returns before effects', async () => {
    const { service, notificationsService, pointsService, replyRepository } = createService();
    const manager = { save: jest.fn(async (_entity, reply) => reply), update: jest.fn() };
    const events = { publish: jest.fn(async () => undefined) };
    (service as any).events = events;
    (service as any).dataSource = { transaction: (run: any) => run(manager) };
    await expect(service.createReplyForPost(88, { content: 'durable' }, REPLIER_ID)).resolves.toMatchObject({ id: 501 });
    expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ eventKey: 'ForumReplyPublished', aggregateId: 501 }), manager);
    expect(replyRepository.save).not.toHaveBeenCalled();
    expect(notificationsService.create).not.toHaveBeenCalled();
    expect(pointsService.awardPoints).not.toHaveBeenCalled();
  });

  it('does not commit the reply when enqueuing its durable event fails', async () => {
    const { service } = createService();
    let committed = false;
    (service as any).events = { publish: jest.fn(async () => { throw new Error('outbox write failed'); }) };
    (service as any).dataSource = { transaction: async (run: any) => { const result = await run({ save: async (_entity: any, reply: any) => reply }); committed = true; return result; } };
    await expect(service.createReplyForPost(88, { content: 'durable' }, REPLIER_ID)).rejects.toThrow('outbox write failed');
    expect(committed).toBe(false);
  });

  it('keeps post-commit cache/notification failures from becoming a reply creation error', async () => {
    const { service, notificationsService, redisService, postActivityService } = createService();
    redisService.del.mockRejectedValue(new Error('Redis unavailable'));
    notificationsService.create.mockRejectedValue(new Error('notification unavailable'));
    postActivityService.markPostActive.mockRejectedValue(new Error('activity unavailable'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(service.createReplyForPost(88, { content: 'durable' }, REPLIER_ID)).resolves.toMatchObject({ status: 'published' });
    warn.mockRestore();
  });

  it('propagates strict mention failure from the durable handler and retries points only after mentions succeed', async () => {
    const { service, replyRepository, notificationsService, pointsService } = createService();
    replyRepository.findOne.mockResolvedValue({ id: 501, post_id: 88, user_id: REPLIER_ID, status: 'published', content: 'hello', created_at: new Date() });
    (notificationsService as any).canReceivePostNotification = jest.fn(async () => true);
    notificationsService.notifyMentionedUsers.mockRejectedValueOnce(new Error('mention unavailable'));
    let handler!: (event: any) => Promise<void>;
    (service as any).events = { register: (_key: any, run: any) => { handler = run; } };
    service.onModuleInit();
    await expect(handler({ aggregate_id: 501 })).rejects.toThrow('mention unavailable');
    expect(pointsService.awardPoints).not.toHaveBeenCalled();
    await handler({ aggregate_id: 501 });
    expect(pointsService.awardPoints).toHaveBeenCalledWith(REPLIER_ID, 'create_reply', 'reply', 501, true);
    expect(notificationsService.notifyMentionedUsers).toHaveBeenLastCalledWith('hello', 88, REPLIER_ID, 501, [], true);
  });

  it('rejects nonmember creation at the group wall before saving', async () => {
    const { service, replyRepository } = createService({ post: { ...OPEN_POST, required_group_id: 4 } });
    await expect(service.createReplyForPost(88, { content: 'private' }, REPLIER_ID)).rejects.toThrow(ForbiddenException);
    expect(replyRepository.save).not.toHaveBeenCalled();
  });

  it('hides pending replies from anonymous readers and bounds the legacy reply list', async () => {
    const { service, replyRepository } = createService();
    replyRepository.findOne.mockResolvedValue({ id: 501, status: 'pending', user_id: REPLIER_ID, post_id: 88 });
    await expect(service.findById(501)).rejects.toThrow(NotFoundException);
    await service.getByPostId(88, 1, 999);
    expect(replyRepository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    await expect(service.getByPostId(88, -1, 20)).rejects.toThrow();
  });
});

it('explicit empty JSON mentions do not fall back to markdown @username parsing', async () => {
  const { service, replyRepository, notificationsService } = createService();
  replyRepository.findOne.mockResolvedValue({ id: 501, post_id: 88, user_id: REPLIER_ID, status: 'published', content: '@username literal', created_at: new Date() });
  (notificationsService as any).canReceivePostNotification = jest.fn(async () => true);
  let handler!: (event: any) => Promise<void>;
  (service as any).events = { register: (_key: any, run: any) => { handler = run; } };
  service.onModuleInit();
  await handler({ aggregate_id: 501, payload_json: { mention_user_ids: [] } });
  expect(notificationsService.notifyMentionedUsers).not.toHaveBeenCalled();
  expect(notificationsService.notifyMentionedUserIds).toHaveBeenCalledWith([], 88, REPLIER_ID, '@username literal', 501, [], true);
});

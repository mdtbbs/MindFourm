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
jest.mock('@common/utils/markdown.util', () => ({ parseMarkdown: (value: string) => value }));

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
    expect(redisService.del).toHaveBeenCalledWith('post:detail:v4:88');
    expect(postActivityService.markPostActive).toHaveBeenCalledWith(88, expect.any(Date));
    expect(reply).toMatchObject({ post_id: 88, user_id: REPLIER_ID, status: 'published' });
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

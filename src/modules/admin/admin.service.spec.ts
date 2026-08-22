const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
  LessThan: jest.fn((value) => ({ _type: 'lessThan', _value: value })),
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
  User: class User {},
  Category: class Category {},
  Tag: class Tag {},
  PostTag: class PostTag {},
  Ban: class Ban {},
  Setting: class Setting {},
  OperationLog: class OperationLog {},
  Reply: class Reply {},
}));

import { AdminService } from './admin.service';

function createService(overrides: {
  postRepository?: Record<string, jest.Mock>;
  replyRepository?: Record<string, jest.Mock>;
  userRepository?: Record<string, jest.Mock>;
  settingsService?: Record<string, jest.Mock>;
  pointsService?: Record<string, jest.Mock>;
} = {}) {
  const postRepository = {
    count: jest.fn().mockResolvedValue(0),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides.postRepository,
  };
  const replyRepository = {
    count: jest.fn().mockResolvedValue(0),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides.replyRepository,
  };
  const userRepository = {
    count: jest.fn().mockResolvedValue(0),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides.userRepository,
  };
  const settingsService = {
    get: jest.fn().mockResolvedValue(null),
    ...overrides.settingsService,
  };
  const pointsService = {
    awardPoints: jest.fn().mockResolvedValue(undefined),
    ...overrides.pointsService,
  };
  const redisService = {
    del: jest.fn().mockResolvedValue(0),
  };
  const postActivityService = {
    markPostActive: jest.fn().mockResolvedValue(undefined),
    recalculatePostActivity: jest.fn().mockResolvedValue(undefined),
  };

  // Positional, so the placeholder count must track the constructor exactly —
  // inserting a dependency shifts every later argument into the wrong slot, and the
  // resulting "Cannot read properties of undefined" names the displaced service
  // rather than the cause. Hence the per-argument labels.
  const service = new AdminService(
    postRepository as any,
    replyRepository as any,
    userRepository as any,
    {} as any, // category
    {} as any, // tag
    {} as any, // postTag
    {} as any, // ban
    {} as any, // setting
    {} as any, // operationLog
    {} as any, // sessionAudit
    {} as any, // dataSource
    {} as any, // statsService
    settingsService as any,
    {} as any, // logsService
    {} as any, // bansService
    {} as any, // categoriesService
    {} as any, // tagsService
    pointsService as any,
    redisService as any,
    postActivityService as any,
  );

  return {
    service,
    postRepository,
    replyRepository,
    userRepository,
    settingsService,
    pointsService,
    redisService,
    postActivityService,
  };
}

describe('AdminService', () => {
  it('returns sidebar-compatible badge counts and falls back to the legacy announcement key', async () => {
    const { service, settingsService } = createService({
      postRepository: {
        count: jest.fn().mockResolvedValue(2),
      },
      replyRepository: {
        count: jest.fn().mockResolvedValue(3),
      },
      userRepository: {
        count: jest.fn().mockResolvedValue(1),
      },
      settingsService: {
        get: jest.fn().mockImplementation(async (key: string) => {
          if (key === 'announce_enabled') return null;
          if (key === 'show_announcement') return 'true';
          return null;
        }),
      },
    });

    await expect(service.getBadgeCounts()).resolves.toEqual({
      moderation_pending: 6,
      announce_active: 1,
      pending_posts: 2,
      pending_replies: 3,
      pending_avatars: 1,
      show_announce: true,
    });

    expect(settingsService.get).toHaveBeenCalledWith('announce_enabled');
    expect(settingsService.get).toHaveBeenCalledWith('show_announcement');
  });

  it('routes moderation actions by item type', async () => {
    const { service, replyRepository, userRepository, pointsService, redisService, postActivityService } = createService({
      replyRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 9, post_id: 88, user_id: 7, status: 'pending' }),
      },
      userRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 5,
          avatar_url: null,
          pending_avatar_url: '/uploads/avatars/pending.png',
          avatar_status: 'pending',
        }),
      },
    });

    await service.approveModerationItem('reply', 9);
    await service.rejectModerationItem('avatar', 5);

    expect(replyRepository.update).toHaveBeenCalledWith(9, { status: 'published' });
    expect(postActivityService.markPostActive).toHaveBeenCalledWith(88);
    expect(redisService.del).toHaveBeenCalledWith('post:detail:v4:88');
    expect(pointsService.awardPoints).toHaveBeenCalledWith(7, 'create_reply', 'reply', 9);
    expect(userRepository.update).toHaveBeenCalledWith(5, {
      pending_avatar_url: null,
      avatar_status: 'rejected',
    });
  });

  it('recalculates topic activity when rejecting a published reply', async () => {
    const { service, postActivityService } = createService({
      replyRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 9, post_id: 88, status: 'published' }),
      },
    });

    await service.rejectReply(9);

    expect(postActivityService.recalculatePostActivity).toHaveBeenCalledWith(88);
  });

  it('normalizes boolean pin values before updating posts', async () => {
    const { service, postRepository } = createService({
      postRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 240, is_pinned: 1 }),
      },
    });

    await service.pinPost(240, true as any);
    await service.bulkPinPosts([240, 241], false as any);

    expect(postRepository.update).toHaveBeenNthCalledWith(1, 240, { is_pinned: 1 });
    expect(postRepository.update).toHaveBeenNthCalledWith(2, [240, 241], { is_pinned: 0 });
  });
});

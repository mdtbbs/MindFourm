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

  const service = new AdminService(
    postRepository as any,
    replyRepository as any,
    userRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    settingsService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    pointsService as any,
  );

  return {
    service,
    postRepository,
    replyRepository,
    userRepository,
    settingsService,
    pointsService,
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
    const { service, replyRepository, userRepository, pointsService } = createService({
      replyRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 9, user_id: 7, status: 'pending' }),
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
    expect(pointsService.awardPoints).toHaveBeenCalledWith(7, 'create_reply', 'reply', 9);
    expect(userRepository.update).toHaveBeenCalledWith(5, {
      pending_avatar_url: null,
      avatar_status: 'rejected',
    });
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

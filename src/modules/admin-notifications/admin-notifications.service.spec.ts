import { AdminNotificationsService } from './admin-notifications.service';

function createService(overrides: {
  adminNotificationRepository?: Record<string, jest.Mock>;
  userRepository?: Record<string, jest.Mock>;
  settingsService?: Record<string, jest.Mock>;
  redisService?: Record<string, jest.Mock>;
  webhookService?: Record<string, jest.Mock>;
} = {}) {
  const adminNotificationRepository = {
    create: jest.fn().mockImplementation((value) => value),
    save: jest.fn().mockImplementation(async (items) => items.map((item: any, index: number) => ({
      id: index + 1,
      created_at: new Date('2026-07-08T12:00:00.000Z'),
      ...item,
    }))),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides.adminNotificationRepository,
  };
  const userRepository = {
    find: jest.fn().mockResolvedValue([
      { id: 4, role: 'moderator' },
      { id: 7, role: 'admin' },
    ]),
    ...overrides.userRepository,
  };
  const settingsService = {
    get: jest.fn().mockImplementation(async (key: string) => {
      if (key === 'admin_notifications_recipient_roles') return 'moderator,admin';
      return null;
    }),
    getBoolean: jest.fn().mockImplementation(async (key: string, defaultValue = false) => {
      if (key === 'admin_notifications_enabled') return true;
      if (key === 'admin_notifications_realtime_enabled') return true;
      if (key === 'admin_notifications_moderation_pending_enabled') return true;
      if (key === 'admin_notifications_moderation_result_enabled') return true;
      return defaultValue;
    }),
    ...overrides.settingsService,
  };
  const publish = jest.fn().mockResolvedValue(1);
  const redisService = {
    getClient: jest.fn().mockReturnValue({ publish }),
    ...overrides.redisService,
  };
  const webhookService = {
    publish: jest.fn().mockResolvedValue(undefined),
    ...overrides.webhookService,
  };

  const service = new AdminNotificationsService(
    adminNotificationRepository as any,
    userRepository as any,
    settingsService as any,
    redisService as any,
    webhookService as any,
  );

  return {
    service,
    adminNotificationRepository,
    userRepository,
    settingsService,
    redisService,
    publish,
    webhookService,
  };
}

describe('AdminNotificationsService', () => {
  it('publishes notifications to configured admin recipients and realtime stream', async () => {
    const { service, adminNotificationRepository, publish, webhookService } = createService();

    const result = await service.publishModerationPending({
      item_type: 'post',
      item_id: 12,
      title: '待审核帖子',
      content: '<p>这是一个待审核内容</p>',
      author_username: 'alice',
      action_url: '/admin/content/moderation',
    });

    expect(adminNotificationRepository.save).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      user_id: 4,
      event_key: 'moderation.post.pending',
      category: 'moderation',
      level: 'warning',
      is_read: false,
    });
    expect(publish).toHaveBeenCalledTimes(2);
    expect(webhookService.publish).toHaveBeenCalledTimes(1);
    expect(webhookService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        event_key: 'moderation.post.pending',
      }),
      expect.arrayContaining([
        expect.objectContaining({
          user_id: 4,
          event_key: 'moderation.post.pending',
        }),
      ]),
    );
  });

  it('skips publishing when the category preference is disabled', async () => {
    const { service, adminNotificationRepository } = createService({
      settingsService: {
        getBoolean: jest.fn().mockImplementation(async (key: string, defaultValue = false) => {
          if (key === 'admin_notifications_enabled') return true;
          if (key === 'admin_notifications_moderation_pending_enabled') return false;
          return defaultValue;
        }),
      },
    });

    const result = await service.publishModerationPending({
      item_type: 'reply',
      item_id: 9,
      title: null,
      content: 'reply body',
      author_username: 'bob',
      action_url: '/admin/content/moderation?type=replies',
    });

    expect(result).toEqual([]);
    expect(adminNotificationRepository.save).not.toHaveBeenCalled();
  });

  it('marks notifications as read for the owning user only', async () => {
    const { service, adminNotificationRepository } = createService({
      adminNotificationRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          user_id: 4,
          is_read: 0,
          read_at: null,
        }),
        save: jest.fn().mockResolvedValue(undefined),
      },
    });

    await service.markAsRead(1, 4);

    expect(adminNotificationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        is_read: 1,
        read_at: expect.any(Date),
      }),
    );
  });
});

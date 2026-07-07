import { AdminService } from './admin.service';

describe('AdminService', () => {
  it('returns sidebar-compatible badge counts and falls back to the legacy announcement key', async () => {
    const postRepository = {
      count: jest.fn().mockResolvedValue(2),
    };
    const replyRepository = {
      count: jest.fn().mockResolvedValue(3),
    };
    const userRepository = {
      count: jest.fn().mockResolvedValue(1),
    };
    const settingsService = {
      get: jest.fn().mockImplementation(async (key: string) => {
        if (key === 'announce_enabled') return null;
        if (key === 'show_announcement') return 'true';
        return null;
      }),
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
      {} as any,
    );

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
});

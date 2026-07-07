import { StatsService } from './stats.service';

describe('StatsService', () => {
  it('returns the full dashboard stats contract expected by the admin dashboard', async () => {
    const postRepository = {
      query: jest.fn()
        .mockResolvedValueOnce([{
          total_posts: '12',
          total_replies: '34',
          total_users: '56',
          today_posts: '2',
          today_replies: '3',
          today_users: '4',
        }])
        .mockResolvedValueOnce([
          { date: '2026-06-29', count: '5' },
          { date: '2026-06-30', count: '8' },
          { date: '2026-07-01', count: '13' },
          { date: '2026-07-02', count: '21' },
          { date: '2026-07-03', count: '34' },
          { date: '2026-07-04', count: '55' },
          { date: '2026-07-05', count: '89' },
        ]),
    };
    const redisService = {
      keys: jest.fn().mockResolvedValue(['session:1', 'session:2']),
    };

    const service = new StatsService(
      postRepository as any,
      {} as any,
      {} as any,
      {} as any,
      redisService as any,
    );

    await expect(service.getDashboardStats()).resolves.toEqual({
      total_posts: 12,
      total_replies: 34,
      total_users: 56,
      active_24h: 2,
      today_posts: 2,
      today_replies: 3,
      today_users: 4,
      activity_7d: [5, 8, 13, 21, 34, 55, 89],
    });

    expect(postRepository.query).toHaveBeenCalledTimes(2);
    expect(redisService.keys).toHaveBeenCalledWith('session:*');
  });

  it('returns homepage overview stats and prefers the latest login user', async () => {
    const postRepository = {
      query: jest.fn().mockResolvedValue([{
        total_posts: '12',
        total_replies: '34',
        total_users: '56',
        total_resources: '7',
      }]),
    };
    const userRepository = {
      query: jest.fn(),
    };
    const sessionAuditRepository = {
      query: jest.fn().mockResolvedValue([{ username: 'alice' }]),
    };

    const service = new StatsService(
      postRepository as any,
      {} as any,
      userRepository as any,
      sessionAuditRepository as any,
      { keys: jest.fn() } as any,
    );

    await expect(service.getForumOverview()).resolves.toEqual({
      total_posts: 12,
      total_replies: 34,
      total_users: 56,
      total_resources: 7,
      latest_user: 'alice',
    });

    expect(postRepository.query).toHaveBeenCalledTimes(1);
    expect(sessionAuditRepository.query).toHaveBeenCalledTimes(1);
    expect(userRepository.query).not.toHaveBeenCalled();
  });

  it('falls back to the latest registered user when there is no login audit', async () => {
    const postRepository = {
      query: jest.fn().mockResolvedValue([{
        total_posts: '1',
        total_replies: '2',
        total_users: '3',
        total_resources: '4',
      }]),
    };
    const userRepository = {
      query: jest.fn().mockResolvedValue([{ username: 'newcomer' }]),
    };
    const sessionAuditRepository = {
      query: jest.fn().mockResolvedValue([]),
    };

    const service = new StatsService(
      postRepository as any,
      {} as any,
      userRepository as any,
      sessionAuditRepository as any,
      { keys: jest.fn() } as any,
    );

    await expect(service.getForumOverview()).resolves.toEqual({
      total_posts: 1,
      total_replies: 2,
      total_users: 3,
      total_resources: 4,
      latest_user: 'newcomer',
    });

    expect(sessionAuditRepository.query).toHaveBeenCalledTimes(1);
    expect(userRepository.query).toHaveBeenCalledTimes(1);
  });
});

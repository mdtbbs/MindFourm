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

jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/reply.entity', () => ({ Reply: class Reply {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));
jest.mock('@entities/session-audit.entity', () => ({ SessionAudit: class SessionAudit {} }));

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
      countKeys: jest.fn().mockResolvedValue(2),
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
    expect(redisService.countKeys).toHaveBeenCalledWith('session:*');
  });

  it('returns homepage overview stats with only safe public totals', async () => {
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
      query: jest.fn(),
    };
    const redisService = {
      countKeys: jest.fn(),
    };

    const service = new StatsService(
      postRepository as any,
      {} as any,
      userRepository as any,
      sessionAuditRepository as any,
      redisService as any,
    );

    await expect(service.getForumOverview()).resolves.toEqual({
      total_posts: 12,
      total_replies: 34,
      total_users: 56,
      total_resources: 7,
    });

    expect(postRepository.query).toHaveBeenCalledTimes(1);
    expect(postRepository.query.mock.calls[0][0]).toContain("status IN ('approved', 'published')");
    expect(sessionAuditRepository.query).not.toHaveBeenCalled();
    expect(userRepository.query).not.toHaveBeenCalled();
    expect(redisService.countKeys).not.toHaveBeenCalled();
  });

  it('returns homepage overview stats without falling back to latest-registration metadata', async () => {
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
    const redisService = {
      countKeys: jest.fn().mockResolvedValue(0),
    };

    const service = new StatsService(
      postRepository as any,
      {} as any,
      userRepository as any,
      sessionAuditRepository as any,
      redisService as any,
    );

    await expect(service.getForumOverview()).resolves.toEqual({
      total_posts: 1,
      total_replies: 2,
      total_users: 3,
      total_resources: 4,
    });

    expect(sessionAuditRepository.query).not.toHaveBeenCalled();
    expect(userRepository.query).not.toHaveBeenCalled();
    expect(redisService.countKeys).not.toHaveBeenCalled();
  });
});

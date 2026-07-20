import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post, Reply, SessionAudit, User } from '@entities/index';
import { RedisService } from '../../database/redis.service';
import { PUBLIC_RESOURCE_STATUSES } from '@common/utils/constants';

export interface DashboardStats {
  total_posts: number;
  total_replies: number;
  total_users: number;
  active_24h: number;
  today_posts: number;
  today_replies: number;
  today_users: number;
  activity_7d: number[];
}

export interface ForumOverviewStats {
  total_posts: number;
  total_replies: number;
  total_users: number;
  total_resources: number;
  latest_user: string | null;
  today_posts: number;
  today_replies: number;
  today_users: number;
  active_24h: number;
}

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(Reply)
    private replyRepository: Repository<Reply>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(SessionAudit)
    private sessionAuditRepository: Repository<SessionAudit>,
    private redisService: RedisService,
  ) {}

  private parseCount(value: unknown): number {
    return Number.parseInt(String(value ?? 0), 10) || 0;
  }

  /**
   * Get dashboard statistics in a single query
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [statsRows, sessionKeys, activity7d] = await Promise.all([
      this.postRepository.query(`
        SELECT
          (SELECT COUNT(*) FROM posts WHERE status = 'published') as total_posts,
          (SELECT COUNT(*) FROM replies WHERE status = 'active') as total_replies,
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM posts WHERE status = 'published' AND created_at >= ?) as today_posts,
          (SELECT COUNT(*) FROM replies WHERE status = 'active' AND created_at >= ?) as today_replies,
          (SELECT COUNT(*) FROM users WHERE created_at >= ?) as today_users
      `, [today, today, today]),
      this.redisService.keys('session:*'),
      this.get7DayActivity(),
    ]);
    const [stats] = statsRows;

    return {
      total_posts: this.parseCount(stats?.total_posts),
      total_replies: this.parseCount(stats?.total_replies),
      total_users: this.parseCount(stats?.total_users),
      active_24h: sessionKeys.length,
      today_posts: this.parseCount(stats?.today_posts),
      today_replies: this.parseCount(stats?.today_replies),
      today_users: this.parseCount(stats?.today_users),
      activity_7d: activity7d.map((row) => row.count),
    };
  }

  async getForumOverview(): Promise<ForumOverviewStats> {
    const publicResourceStatusesSql = PUBLIC_RESOURCE_STATUSES.map((status) => `'${status}'`).join(', ');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [statsRows, latestLoginRows, sessionKeys] = await Promise.all([
      this.postRepository.query(`
        SELECT
          (SELECT COUNT(*) FROM posts WHERE status = 'published') as total_posts,
          (SELECT COUNT(*) FROM replies WHERE status = 'active') as total_replies,
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM resources WHERE status IN (${publicResourceStatusesSql})) as total_resources,
          (SELECT COUNT(*) FROM posts WHERE status = 'published' AND created_at >= ?) as today_posts,
          (SELECT COUNT(*) FROM replies WHERE status = 'active' AND created_at >= ?) as today_replies,
          (SELECT COUNT(*) FROM users WHERE created_at >= ?) as today_users
      `, [today, today, today]),
      this.sessionAuditRepository.query(`
        SELECT u.username
        FROM session_audit sa
        INNER JOIN users u ON u.id = sa.user_id
        WHERE sa.action = 'login'
        ORDER BY sa.created_at DESC, sa.id DESC
        LIMIT 1
      `),
      this.redisService.keys('session:*'),
    ]);

    const latestUserRows = latestLoginRows.length > 0
      ? latestLoginRows
      : await this.userRepository.query(`
        SELECT username
        FROM users
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `);

    const [stats] = statsRows;

    return {
      total_posts: this.parseCount(stats?.total_posts),
      total_replies: this.parseCount(stats?.total_replies),
      total_users: this.parseCount(stats?.total_users),
      total_resources: this.parseCount(stats?.total_resources),
      latest_user: typeof latestUserRows[0]?.username === 'string'
        ? latestUserRows[0].username
        : null,
      today_posts: this.parseCount(stats?.today_posts),
      today_replies: this.parseCount(stats?.today_replies),
      today_users: this.parseCount(stats?.today_users),
      active_24h: sessionKeys.length,
    };
  }

  /**
   * Get 7-day activity data using CTE
   */
  async get7DayActivity(): Promise<Array<{ date: string; count: number }>> {
    const result = await this.postRepository.query(`
      WITH RECURSIVE dates AS (
        SELECT CURDATE() as date
        UNION ALL
        SELECT DATE_SUB(date, INTERVAL 1 DAY)
        FROM dates
        WHERE DATE_SUB(date, INTERVAL 1 DAY) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      )
      SELECT
        d.date,
        COUNT(p.id) as count
      FROM dates d
      LEFT JOIN posts p ON DATE(p.created_at) = d.date AND p.status = 'published'
      GROUP BY d.date
      ORDER BY d.date ASC
    `);

    return result.map((row: any) => ({
      date: row.date,
      count: parseInt(row.count, 10),
    }));
  }
}

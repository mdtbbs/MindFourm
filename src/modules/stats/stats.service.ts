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
  total_resources: number;
  active_24h: number;
  today_posts: number;
  today_replies: number;
  today_users: number;
  today_resources: number;
  pending_resources: number;
  pending_reports: number;
  average_report_resolution_hours: number | null;
  zero_result_searches_7d: number;
  activity_7d: number[];
  resource_type_breakdown: Array<{ type: string; count: number }>;
}

export interface ForumOverviewStats {
  total_posts: number;
  total_replies: number;
  total_users: number;
  total_resources: number;
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

    const [statsRows, sessionCount, activity7d, resourceTypeBreakdown] = await Promise.all([
      this.postRepository.query(`
        SELECT
          (SELECT COUNT(*) FROM posts WHERE status = 'published') as total_posts,
          (SELECT COUNT(*) FROM replies WHERE status = 'published') as total_replies,
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM resources WHERE deleted_at IS NULL) as total_resources,
          (SELECT COUNT(*) FROM posts WHERE status = 'published' AND created_at >= ?) as today_posts,
          (SELECT COUNT(*) FROM replies WHERE status = 'published' AND created_at >= ?) as today_replies,
          (SELECT COUNT(*) FROM users WHERE created_at >= ?) as today_users,
          (SELECT COUNT(*) FROM resources WHERE deleted_at IS NULL AND created_at >= ?) as today_resources,
          (SELECT COUNT(*) FROM resources WHERE deleted_at IS NULL AND status = 'pending') as pending_resources,
          (SELECT COUNT(*) FROM reports WHERE status = 'pending') as pending_reports,
          (SELECT AVG(TIMESTAMPDIFF(SECOND, created_at, handled_at)) / 3600 FROM reports WHERE status IN ('resolved', 'dismissed') AND handled_at IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) as average_report_resolution_hours,
          (SELECT COUNT(*) FROM search_history WHERE results_count = 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as zero_result_searches_7d
      `, [today, today, today, today]),
      // SCAN rather than KEYS: this is served on request paths, and KEYS blocks the
      // whole Redis instance for the duration of the scan.
      this.redisService.countKeys('session:*'),
      this.get7DayActivity(),
      this.getResourceTypeBreakdown(),
    ]);
    const [stats] = statsRows;

    return {
      total_posts: this.parseCount(stats?.total_posts),
      total_replies: this.parseCount(stats?.total_replies),
      total_users: this.parseCount(stats?.total_users),
      total_resources: this.parseCount(stats?.total_resources),
      // Counts every live session (7-day TTL), not strictly 24-hour activity.
      active_24h: sessionCount,
      today_posts: this.parseCount(stats?.today_posts),
      today_replies: this.parseCount(stats?.today_replies),
      today_users: this.parseCount(stats?.today_users),
      today_resources: this.parseCount(stats?.today_resources),
      pending_resources: this.parseCount(stats?.pending_resources),
      pending_reports: this.parseCount(stats?.pending_reports),
      average_report_resolution_hours: stats?.average_report_resolution_hours === null || stats?.average_report_resolution_hours === undefined
        ? null
        : Math.round(Number(stats.average_report_resolution_hours) * 10) / 10,
      zero_result_searches_7d: this.parseCount(stats?.zero_result_searches_7d),
      activity_7d: activity7d.map((row) => row.count),
      resource_type_breakdown: resourceTypeBreakdown,
    };
  }

  async getForumOverview(): Promise<ForumOverviewStats> {
    const publicResourceStatusesSql = PUBLIC_RESOURCE_STATUSES.map((status) => `'${status}'`).join(', ');

    const [statsRows] = await Promise.all([
      this.postRepository.query(`
        SELECT
          (SELECT COUNT(*) FROM posts WHERE status = 'published') as total_posts,
          (SELECT COUNT(*) FROM replies WHERE status = 'published') as total_replies,
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM resources WHERE status IN (${publicResourceStatusesSql})) as total_resources
      `),
    ]);

    const [stats] = statsRows;

    return {
      total_posts: this.parseCount(stats?.total_posts),
      total_replies: this.parseCount(stats?.total_replies),
      total_users: this.parseCount(stats?.total_users),
      total_resources: this.parseCount(stats?.total_resources),
    };
  }

  /**
   * Get 7-day activity data without CTEs.
   *
   * Production may run on MySQL 5.7-compatible engines, where `WITH RECURSIVE`
   * is a syntax error. A fixed derived table gives the same seven rows and works
   * on both MySQL 5.7 and 8.x.
   */
  async get7DayActivity(): Promise<Array<{ date: string; count: number }>> {
    const result = await this.postRepository.query(`
      SELECT
        d.date,
        COUNT(p.id) as count
      FROM (
        SELECT DATE_SUB(CURDATE(), INTERVAL 6 DAY) as date
        UNION ALL SELECT DATE_SUB(CURDATE(), INTERVAL 5 DAY)
        UNION ALL SELECT DATE_SUB(CURDATE(), INTERVAL 4 DAY)
        UNION ALL SELECT DATE_SUB(CURDATE(), INTERVAL 3 DAY)
        UNION ALL SELECT DATE_SUB(CURDATE(), INTERVAL 2 DAY)
        UNION ALL SELECT DATE_SUB(CURDATE(), INTERVAL 1 DAY)
        UNION ALL SELECT CURDATE()
      ) d
      LEFT JOIN posts p ON DATE(p.created_at) = d.date AND p.status = 'published'
      GROUP BY d.date
      ORDER BY d.date ASC
    `);

    return result.map((row: any) => ({
      date: row.date,
      count: parseInt(row.count, 10),
    }));
  }

  /** Aggregated by resource type only; no user or IP-level data is exposed. */
  private async getResourceTypeBreakdown(): Promise<Array<{ type: string; count: number }>> {
    const rows = await this.postRepository.query(`
      SELECT COALESCE(NULLIF(resource_kind, ''), resource_type, 'other') AS type, COUNT(*) AS count
      FROM resources
      WHERE deleted_at IS NULL
      GROUP BY COALESCE(NULLIF(resource_kind, ''), resource_type, 'other')
      ORDER BY count DESC, type ASC
      LIMIT 8
    `);

    return rows.map((row: any) => ({
      type: String(row.type || 'other'),
      count: this.parseCount(row.count),
    }));
  }
}

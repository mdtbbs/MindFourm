import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post, Reply, SessionAudit, User } from '@entities/index';
import { RedisService } from '../../database/redis.service';
import { PUBLIC_RESOURCE_STATUSES } from '@common/utils/constants';

export interface DashboardStats {
  range_days: 1 | 7 | 30 | 90;
  range_metrics: {
    new_users: number;
    threads: number;
    replies: number;
    resources: number;
    reports: number;
    downloads: number;
    views: number;
    failed_jobs: number;
    email_failures: number;
    outbox_failures: number;
    renderer_queue: number;
  };
  total_posts: number;
  community_posts: number;
  automated_posts: number;
  total_replies: number;
  total_users: number;
  total_resources: number;
  active_24h: number;
  active_24h_observed_since: string;
  active_24h_complete: boolean;
  today_posts: number;
  today_community_posts: number;
  today_automated_posts: number;
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
  private readonly cache = new Map<string, { expires: number; value: unknown }>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  private cached<T>(key: string, build: () => Promise<T>): Promise<T> {
    const entry = this.cache.get(key);
    if (entry && entry.expires > Date.now()) return Promise.resolve(entry.value as T);
    const running = this.inFlight.get(key);
    if (running) return running as Promise<T>;
    const promise = build().then((value) => {
      this.cache.set(key, { expires: Date.now() + 15_000, value });
      return value;
    }).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

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
  getDashboardStats(rangeDays: 1 | 7 | 30 | 90 = 7): Promise<DashboardStats> {
    const safeRange = ([1, 7, 30, 90].includes(Number(rangeDays)) ? Number(rangeDays) : 7) as 1 | 7 | 30 | 90;
    return this.cached(`dashboard:${safeRange}`, () => this.buildDashboardStats(safeRange));
  }

  private async buildDashboardStats(rangeDays: 1 | 7 | 30 | 90): Promise<DashboardStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [statsRows, sessionCount, activity7d, resourceTypeBreakdown, rangeRows] = await Promise.all([
      this.postRepository.query(`
        SELECT p.*, r.*, u.*, a.*,
          (SELECT COUNT(*) FROM reports WHERE status = 'pending') as pending_reports,
          (SELECT AVG(TIMESTAMPDIFF(SECOND, created_at, handled_at)) / 3600 FROM reports WHERE status IN ('resolved', 'dismissed') AND handled_at IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) as average_report_resolution_hours,
          (SELECT COUNT(*) FROM search_history WHERE results_count = 0 AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as zero_result_searches_7d
        FROM (
          SELECT SUM(source = 'USER') as total_posts, SUM(source = 'USER') as community_posts,
            SUM(source <> 'USER') as automated_posts, SUM(created_at >= ?) as today_posts,
            SUM(source = 'USER' AND created_at >= ?) as today_community_posts,
            SUM(source <> 'USER' AND created_at >= ?) as today_automated_posts
          FROM posts WHERE deleted_at IS NULL AND status = 'published'
        ) p CROSS JOIN (
          SELECT COUNT(*) as total_replies, SUM(created_at >= ?) as today_replies
          FROM replies WHERE deleted_at IS NULL AND status = 'published'
        ) r CROSS JOIN (
          SELECT COUNT(*) as total_users, SUM(created_at >= ?) as today_users FROM users
        ) u CROSS JOIN (
          SELECT COUNT(*) as total_resources, SUM(created_at >= ?) as today_resources,
            SUM(status = 'pending') as pending_resources FROM resources WHERE deleted_at IS NULL
        ) a
      `, [today, today, today, today, today, today]),
      // Rolling 24-hour distinct authenticated users, including mobile/OAuth clients.
      this.redisService.activeUserStats(),
      this.get7DayActivity(),
      this.getResourceTypeBreakdown(),
      this.postRepository.query(`
        SELECT
          (SELECT COUNT(*) FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${rangeDays} DAY)) AS new_users,
          (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 'published' AND created_at >= DATE_SUB(NOW(), INTERVAL ${rangeDays} DAY)) AS threads,
          (SELECT COUNT(*) FROM replies WHERE deleted_at IS NULL AND status = 'published' AND created_at >= DATE_SUB(NOW(), INTERVAL ${rangeDays} DAY)) AS replies,
          (SELECT COUNT(*) FROM resources WHERE deleted_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL ${rangeDays} DAY)) AS resources,
          (SELECT COUNT(*) FROM reports WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${rangeDays} DAY)) AS reports,
          (SELECT COUNT(*) FROM download_events WHERE event_type = 'granted' AND created_at >= DATE_SUB(NOW(), INTERVAL ${rangeDays} DAY)) AS downloads,
          (SELECT COUNT(*) FROM resource_view_events WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${rangeDays} DAY)) AS views,
          (SELECT COUNT(*) FROM download_events WHERE event_type = 'failed' AND created_at >= DATE_SUB(NOW(), INTERVAL ${rangeDays} DAY)) AS failed_jobs,
          (SELECT COUNT(*) FROM email_logs WHERE status IN ('failed', 'bounced') AND sent_at >= DATE_SUB(NOW(), INTERVAL ${rangeDays} DAY)) AS email_failures,
          (SELECT COUNT(*) FROM outbox_events WHERE status = 'failed' AND created_at >= DATE_SUB(NOW(), INTERVAL ${rangeDays} DAY)) AS outbox_failures,
          (SELECT COUNT(*) FROM resources WHERE deleted_at IS NULL AND renderer_status = 'processing') AS renderer_queue
      `),
    ]);
    const [stats] = statsRows;
    const [range] = rangeRows;

    return {
      range_days: rangeDays,
      range_metrics: {
        new_users: this.parseCount(range?.new_users),
        threads: this.parseCount(range?.threads),
        replies: this.parseCount(range?.replies),
        resources: this.parseCount(range?.resources),
        reports: this.parseCount(range?.reports),
        downloads: this.parseCount(range?.downloads),
        views: this.parseCount(range?.views),
        failed_jobs: this.parseCount(range?.failed_jobs),
        email_failures: this.parseCount(range?.email_failures),
        outbox_failures: this.parseCount(range?.outbox_failures),
        renderer_queue: this.parseCount(range?.renderer_queue),
      },
      total_posts: this.parseCount(stats?.total_posts),
      community_posts: this.parseCount(stats?.community_posts),
      automated_posts: this.parseCount(stats?.automated_posts),
      total_replies: this.parseCount(stats?.total_replies),
      total_users: this.parseCount(stats?.total_users),
      total_resources: this.parseCount(stats?.total_resources),
      // Multiple sessions for the same user count once.
      active_24h: sessionCount.count,
      active_24h_observed_since: sessionCount.observedSince,
      active_24h_complete: sessionCount.complete,
      today_posts: this.parseCount(stats?.today_posts),
      today_community_posts: this.parseCount(stats?.today_community_posts),
      today_automated_posts: this.parseCount(stats?.today_automated_posts),
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

  getForumOverview(): Promise<ForumOverviewStats> {
    return this.cached('overview', () => this.buildForumOverview());
  }

  private async buildForumOverview(): Promise<ForumOverviewStats> {
    const publicResourceStatusesSql = PUBLIC_RESOURCE_STATUSES.map((status) => `'${status}'`).join(', ');

    const [statsRows] = await Promise.all([
      this.postRepository.query(`
        SELECT
          (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 'published') as total_posts,
          (SELECT COUNT(*) FROM replies WHERE deleted_at IS NULL AND status = 'published') as total_replies,
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM resources WHERE deleted_at IS NULL AND status IN (${publicResourceStatusesSql})) as total_resources
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
      LEFT JOIN posts p ON p.created_at >= d.date AND p.created_at < DATE_ADD(d.date, INTERVAL 1 DAY) AND p.deleted_at IS NULL AND p.status = 'published' AND p.source = 'USER'
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

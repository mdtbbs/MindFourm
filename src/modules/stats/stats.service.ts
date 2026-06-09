import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post, Reply, User } from '@entities/index';
import { RedisService } from '../../database/redis.service';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(Reply)
    private replyRepository: Repository<Reply>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private redisService: RedisService,
  ) {}

  /**
   * Get dashboard statistics in a single query
   */
  async getDashboardStats(): Promise<{
    total_posts: number;
    total_replies: number;
    total_users: number;
    posts_today: number;
    replies_today: number;
    active_24h: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date();
    yesterday.setHours(0, 0, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);

    // Single query with subqueries for counts
    const [stats] = await this.postRepository.query(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE status = 'published') as total_posts,
        (SELECT COUNT(*) FROM replies WHERE status = 'active') as total_replies,
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM posts WHERE status = 'published' AND created_at >= ?) as posts_today,
        (SELECT COUNT(*) FROM replies WHERE status = 'active' AND created_at >= ?) as replies_today
    `, [today, today]);

    // Count active sessions from Redis
    const sessionKeys = await this.redisService.keys('session:*');
    const active_24h = sessionKeys.length;

    return {
      total_posts: parseInt(stats.total_posts, 10),
      total_replies: parseInt(stats.total_replies, 10),
      total_users: parseInt(stats.total_users, 10),
      posts_today: parseInt(stats.posts_today, 10),
      replies_today: parseInt(stats.replies_today, 10),
      active_24h,
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

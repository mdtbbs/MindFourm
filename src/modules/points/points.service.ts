import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan, LessThan } from 'typeorm';
import { PointLog } from '@entities/point-log.entity';
import { PointRule } from '@entities/point-rule.entity';
import { User } from '@entities/user.entity';
import { encodeCursor, decodeCursor } from '@common/utils/cursor.util';
import { CreatePointRuleDto, UpdatePointRuleDto } from './dto/admin-points.dto';

@Injectable()
export class PointsService {
  constructor(
    @InjectRepository(PointLog)
    private pointLogRepo: Repository<PointLog>,
    @InjectRepository(PointRule)
    private pointRuleRepo: Repository<PointRule>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private dataSource: DataSource,
  ) {}

  /**
   * Award points to a user based on an action
   */
  async awardPoints(
    userId: number,
    action: string,
    targetType?: string,
    targetId?: number,
  ): Promise<PointLog | null> {
    const rule = await this.pointRuleRepo.findOne({
      where: { action, is_active: 1 },
    });

    if (!rule) {
      return null; // No rule for this action, skip
    }

    if (rule.points <= 0) {
      return null;
    }

    return this.dataSource.transaction(async (manager) => {
      // Update user points
      await manager.increment(User, { id: userId }, 'total_points', rule.points);
      await manager.increment(User, { id: userId }, 'available_points', rule.points);

      // Create log entry
      const log = new PointLog();
      log.user_id = userId;
      log.action = action;
      log.points_change = rule.points;
      log.target_type = targetType as string;
      log.target_id = targetId as number;
      await manager.save(PointLog, log);

      return log;
    });
  }

  /**
   * Deduct points from a user
   */
  async deductPoints(
    userId: number,
    amount: number,
    reason: string,
  ): Promise<PointLog> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, { where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (user.available_points < amount) {
        throw new BadRequestException('积分不足');
      }

      await manager.decrement(User, { id: userId }, 'available_points', amount);

      const log = new PointLog();
      log.user_id = userId;
      log.action = reason;
      log.points_change = -amount;
      log.target_type = undefined as any;
      log.target_id = undefined as any;
      await manager.save(PointLog, log);

      return log;
    });
  }

  /**
   * Manually award points (admin action)
   */
  async awardPointsManual(
    userId: number,
    amount: number,
    reason: string,
  ): Promise<PointLog> {
    return this.dataSource.transaction(async (manager) => {
      await manager.increment(User, { id: userId }, 'total_points', amount);
      await manager.increment(User, { id: userId }, 'available_points', amount);

      const log = new PointLog();
      log.user_id = userId;
      log.action = reason;
      log.points_change = amount;
      log.target_type = 'admin_award';
      log.target_id = undefined as any;
      await manager.save(PointLog, log);

      return log;
    });
  }

  /**
   * Get user's current points info
   */
  async getUserPoints(userId: number): Promise<{ total_points: number; available_points: number }> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['total_points', 'available_points'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      total_points: user.total_points,
      available_points: user.available_points,
    };
  }

  /**
   * Get point history for a user with cursor pagination
   */
  async getHistory(
    userId: number,
    limit: number = 20,
    cursor?: string,
  ): Promise<{ logs: PointLog[]; nextCursor: string | null }> {
    const cappedLimit = Math.min(limit, 50);

    const query = this.pointLogRepo.createQueryBuilder('pl')
      .where('pl.user_id = :userId', { userId })
      .orderBy('pl.id', 'DESC')
      .take(cappedLimit + 1);

    if (cursor) {
      const decoded = decodeCursor(cursor);
      query.andWhere('pl.id < :cursorId', { cursorId: decoded });
    }

    const logs = await query.getMany();

    const hasMore = logs.length > cappedLimit;
    if (hasMore) {
      logs.pop();
    }

    const nextCursor = hasMore && logs.length > 0
      ? encodeCursor(logs[logs.length - 1].id)
      : null;

    return { logs, nextCursor };
  }

  /**
   * Get leaderboard with offset pagination
   */
  async getLeaderboard(
    limit: number = 20,
    page: number = 1,
  ): Promise<{ users: any[]; total: number }> {
    const cappedLimit = Math.min(limit, 50);
    const offset = (page - 1) * cappedLimit;

    const [users, total] = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.username', 'u.avatar_url', 'u.total_points'])
      .orderBy('u.total_points', 'DESC')
      .addOrderBy('u.created_at', 'ASC')
      .skip(offset)
      .take(cappedLimit)
      .getManyAndCount();

    const rankedUsers = users.map((user, index) => ({
      ...user,
      rank: offset + index + 1,
    }));

    return { users: rankedUsers, total };
  }

  /**
   * Get all point rules
   */
  async getRules(): Promise<PointRule[]> {
    return this.pointRuleRepo.find({
      order: { action: 'ASC' },
    });
  }

  /**
   * Create a new point rule
   */
  async createRule(dto: CreatePointRuleDto): Promise<PointRule> {
    const existing = await this.pointRuleRepo.findOne({
      where: { action: dto.action },
    });

    if (existing) {
      throw new ConflictException('积分规则已存在');
    }

    const rule = this.pointRuleRepo.create(dto);
    return this.pointRuleRepo.save(rule);
  }

  /**
   * Update a point rule
   */
  async updateRule(id: number, dto: UpdatePointRuleDto): Promise<PointRule> {
    const rule = await this.pointRuleRepo.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException('积分规则不存在');
    }

    Object.assign(rule, dto);
    return this.pointRuleRepo.save(rule);
  }

  /**
   * Delete a point rule
   */
  async deleteRule(id: number): Promise<void> {
    const result = await this.pointRuleRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('积分规则不存在');
    }
  }

  /**
   * Initialize default point rules (called on app startup)
   */
  async initializeDefaultRules(): Promise<void> {
    const existing = await this.pointRuleRepo.count();
    if (existing > 0) {
      return; // Already initialized
    }

    const defaultRules = [
      { action: 'create_post', points: 10, description: '发布帖子', is_active: 1 },
      { action: 'create_reply', points: 5, description: '发布回复', is_active: 1 },
      { action: 'receive_like', points: 2, description: '收到点赞', is_active: 1 },
      { action: 'daily_login', points: 1, description: '每日登录', is_active: 1 },
    ];

    for (const rule of defaultRules) {
      const newRule = this.pointRuleRepo.create(rule);
      await this.pointRuleRepo.save(newRule);
    }
  }
}

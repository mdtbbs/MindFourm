import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Badge } from '@entities/badge.entity';
import { UserBadge } from '@entities/user-badge.entity';
import { User } from '@entities/user.entity';

@Injectable()
export class BadgesService {
  constructor(
    @InjectRepository(Badge)
    private badgeRepo: Repository<Badge>,
    @InjectRepository(UserBadge)
    private userBadgeRepo: Repository<UserBadge>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async getAllBadges(): Promise<Badge[]> {
    return this.badgeRepo.find({ where: { is_active: 1 }, order: { level: 'ASC' } });
  }

  async getUserBadges(userId: number): Promise<UserBadge[]> {
    return this.userBadgeRepo.find({
      where: { user_id: userId },
      relations: ['badge'],
      order: { granted_at: 'DESC' },
    });
  }

  async awardBadge(userId: number, badgeId: number, grantedBy?: number): Promise<UserBadge> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const badge = await this.badgeRepo.findOne({ where: { id: badgeId } });
    if (!badge) throw new NotFoundException('Badge not found');

    const existing = await this.userBadgeRepo.findOne({
      where: { user_id: userId, badge_id: badgeId },
    });
    if (existing) throw new BadRequestException('用户已获得此徽章');

    const userBadge = this.userBadgeRepo.create({
      user_id: userId,
      badge_id: badgeId,
      granted_by: grantedBy,
    });
    return this.userBadgeRepo.save([userBadge]).then(r => r[0]);
  }

  async removeUserBadge(userId: number, badgeId: number): Promise<void> {
    const result = await this.userBadgeRepo.delete({ user_id: userId, badge_id: badgeId });
    if (result.affected === 0) throw new NotFoundException('徽章记录不存在');
  }

  // Admin methods
  async adminGetAllBadges(): Promise<Badge[]> {
    return this.badgeRepo.find({ order: { created_at: 'DESC' } });
  }

  async adminCreateBadge(data: Partial<Badge>): Promise<Badge> {
    const badge = this.badgeRepo.create(data);
    return this.badgeRepo.save(badge);
  }

  async adminUpdateBadge(id: number, data: Partial<Badge>): Promise<Badge> {
    const badge = await this.badgeRepo.findOne({ where: { id } });
    if (!badge) throw new NotFoundException('徽章不存在');
    Object.assign(badge, data);
    return this.badgeRepo.save(badge);
  }

  async adminDeleteBadge(id: number): Promise<void> {
    const result = await this.badgeRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('徽章不存在');
  }

  async initializeDefaultBadges(): Promise<void> {
    const existing = await this.badgeRepo.count();
    if (existing > 0) return;

    const defaults = [
      { name: '初来乍到', slug: 'first-post', icon: '🎉', description: '发布第一篇帖子', level: 'bronze', criteria: '{"type":"post_count","value":1}', is_active: 1 },
      { name: '笔耕不辍', slug: 'prolific-writer', icon: '✍️', description: '发布50篇帖子', level: 'silver', criteria: '{"type":"post_count","value":50}', is_active: 1 },
      { name: '人气之星', slug: 'popular', icon: '⭐', description: '收到100个赞', level: 'gold', criteria: '{"type":"like_count","value":100}', is_active: 1 },
      { name: '社区元老', slug: 'veteran', icon: '🏆', description: '活跃365天', level: 'platinum', criteria: '{"type":"active_days","value":365}', is_active: 1 },
    ];

    for (const d of defaults) {
      await this.badgeRepo.save(this.badgeRepo.create(d));
    }
  }
}

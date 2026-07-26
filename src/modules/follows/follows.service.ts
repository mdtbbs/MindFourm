import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Follow } from '@entities/follow.entity';
import { User } from '@entities/user.entity';
import { toPublicUsers } from '../users/public-user.util';

@Injectable()
export class FollowsService {
  constructor(
    @InjectRepository(Follow)
    private followRepo: Repository<Follow>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private dataSource: DataSource,
  ) {}

  async followUser(followerId: number, followingId: number): Promise<Follow> {
    if (followerId === followingId) {
      throw new BadRequestException('不能关注自己');
    }

    const user = await this.userRepo.findOne({ where: { id: followingId } });
    if (!user) throw new NotFoundException('用户不存在');

    const existing = await this.followRepo.findOne({
      where: { follower_id: followerId, following_id: followingId },
    });
    if (existing) throw new BadRequestException('已关注该用户');

    const follow = this.followRepo.create({ follower_id: followerId, following_id: followingId });
    return this.followRepo.save(follow);
  }

  async unfollowUser(followerId: number, followingId: number): Promise<void> {
    const result = await this.followRepo.delete({
      follower_id: followerId,
      following_id: followingId,
    });
    if (result.affected === 0) throw new BadRequestException('未关注该用户');
  }

  async checkFollowStatus(followerId: number, followingId: number): Promise<boolean> {
    const follow = await this.followRepo.findOne({
      where: { follower_id: followerId, following_id: followingId },
    });
    return !!follow;
  }

  async getFollowers(userId: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const cappedLimit = Math.min(limit, 50);

    const [follows, total] = await this.followRepo.findAndCount({
      where: { following_id: userId },
      relations: ['follower'],
      order: { created_at: 'DESC' },
      skip,
      take: cappedLimit,
    });

    return {
      // Unauthenticated route: strip email and other private columns.
      users: toPublicUsers(follows.map(f => f.follower)),
      total,
      page,
      limit: cappedLimit,
      totalPages: Math.ceil(total / cappedLimit),
    };
  }

  async getFollowing(userId: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const cappedLimit = Math.min(limit, 50);

    const [follows, total] = await this.followRepo.findAndCount({
      where: { follower_id: userId },
      relations: ['following'],
      order: { created_at: 'DESC' },
      skip,
      take: cappedLimit,
    });

    return {
      users: toPublicUsers(follows.map(f => f.following)),
      total,
      page,
      limit: cappedLimit,
      totalPages: Math.ceil(total / cappedLimit),
    };
  }

  async getFollowCounts(userId: number): Promise<{ followers: number; following: number }> {
    const [followers, following] = await Promise.all([
      this.followRepo.count({ where: { following_id: userId } }),
      this.followRepo.count({ where: { follower_id: userId } }),
    ]);
    return { followers, following };
  }
}

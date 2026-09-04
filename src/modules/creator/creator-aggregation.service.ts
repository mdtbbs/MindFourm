import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@entities/user.entity';
import { ResourceAttribution } from '@entities/resource-attribution.entity';
import { Post } from '@entities/post.entity';
import { ResourceFavorite } from '@entities/resource-favorite.entity';

/**
 * Creator Aggregation Service.
 *
 * Builds creator profiles from:
 * - Resource attributions (resources they've submitted/authored)
 * - Thread/post counts
 * - Social data (downloads, favorites)
 *
 * This is a read-only aggregation service — it does not own the underlying data.
 */

export type CreatorProfile = {
  user_id: number;
  username: string;
  display_name: string | null;
  resource_count: number;
  thread_count: number;
  total_downloads: number;
  favorite_count: number;
  member_since: string;
};

@Injectable()
export class CreatorAggregationService {
  private readonly logger = new Logger(CreatorAggregationService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(ResourceAttribution) private readonly attributionRepo: Repository<ResourceAttribution>,
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(ResourceFavorite) private readonly favoriteRepo: Repository<ResourceFavorite>,
  ) {}

  /**
   * Build a creator profile for a user.
   */
  async getCreatorProfile(userId: number): Promise<CreatorProfile | null> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return null;

    const [resourceCount, threadCount, totalDownloads, favoriteCount] = await Promise.all([
      this.attributionRepo.count({ where: { user_id: userId } }),
      this.postRepo.count({ where: { user_id: userId, status: 'published' } }),
      this.sumResourceDownloads(userId),
      this.countFavoritesThroughAttribution(userId),
    ]);

    return {
      user_id: user.id,
      username: user.username,
      display_name: (user as any).display_name || null,
      resource_count: resourceCount,
      thread_count: threadCount,
      total_downloads: totalDownloads,
      favorite_count: favoriteCount,
      member_since: user.created_at?.toISOString() || '',
    };
  }

  /**
   * Sum total downloads across all resources attributed to a user.
   */
  private async sumResourceDownloads(userId: number): Promise<number> {
    const result = await this.attributionRepo
      .createQueryBuilder('a')
      .innerJoin('resources', 'r', 'r.id = a.resource_id')
      .select('COALESCE(SUM(r.download_count), 0)', 'total')
      .where('a.user_id = :userId', { userId })
      .getRawOne();

    return Number(result?.total ?? 0);
  }

  /**
   * Count favorites on resources attributed to a user.
   * Joins through attribution: resource_favorites → resources → resource_attributions.
   */
  private async countFavoritesThroughAttribution(userId: number): Promise<number> {
    const result = await this.attributionRepo
      .createQueryBuilder('a')
      .innerJoin('resources', 'r', 'r.id = a.resource_id')
      .innerJoin('resource_favorites', 'f', 'f.resource_id = r.id')
      .select('COUNT(f.id)', 'total')
      .where('a.user_id = :userId', { userId })
      .getRawOne();

    return Number(result?.total ?? 0);
  }
}

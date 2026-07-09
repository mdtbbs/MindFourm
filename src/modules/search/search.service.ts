import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { SearchHistory } from '@entities/search-history.entity';
import { PopularSearch } from '@entities/popular-search.entity';
import { RedisService } from '../../database/redis.service';
import { escapeLike } from '../../common/utils/search.util';
import { PostSummaryDto, PostSummaryService } from '../posts/post-summary.service';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(SearchHistory)
    private searchHistoryRepo: Repository<SearchHistory>,
    @InjectRepository(PopularSearch)
    private popularSearchRepo: Repository<PopularSearch>,
    private redisService: RedisService,
    private postSummaryService: PostSummaryService,
  ) {}

  async searchPosts(
    query: string,
    options: { page?: number; limit?: number; category?: string; sort?: string },
  ): Promise<{
    data: PostSummaryDto[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 50);

    const qb = this.postRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.user', 'user')
      .leftJoinAndSelect('p.category', 'category')
      .select([
        'p.id',
        'p.user_id',
        'p.category_id',
        'p.server_id',
        'p.post_type',
        'p.title',
        'p.content',
        'p.status',
        'p.is_pinned',
        'p.view_count',
        'p.like_count',
        'p.created_at',
        'p.updated_at',
        'user.id',
        'user.mindauth_id',
        'user.role',
        'category.id',
        'category.name',
        'category.slug',
      ])
      .where('p.status = :status', { status: 'published' })
      .andWhere(
        '(p.title LIKE :query OR p.content LIKE :query)',
        { query: `%${escapeLike(query)}%` },
      );

    if (options.category) {
      qb.andWhere('category.slug = :category', { category: options.category });
    }

    if (options.sort === 'relevance') {
      qb.orderBy('CASE WHEN p.title LIKE :query THEN 1 ELSE 0 END', 'DESC');
      qb.addOrderBy('p.created_at', 'DESC');
    } else if (options.sort === 'oldest') {
      qb.orderBy('p.created_at', 'ASC');
    } else {
      qb.orderBy('p.created_at', 'DESC');
    }

    qb.skip((page - 1) * limit).take(limit);

    const [posts, total] = await qb.getManyAndCount();
    const data = await this.postSummaryService.toSummaryList(posts);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async searchUsers(query: string, limit: number = 20) {
    return this.userRepository.find({
      where: [
        { username: Like(`%${escapeLike(query)}%`) },
        { bio: Like(`%${escapeLike(query)}%`) },
      ],
      take: limit,
      select: ['id', 'username', 'avatar_url', 'bio'],
    });
  }

  async recordSearch(userId: number | undefined, query: string, resultsCount: number): Promise<void> {
    // Record search history
    this.searchHistoryRepo.save({
      user_id: userId as number,
      query: query.toLowerCase().trim(),
      search_type: 'global',
      results_count: resultsCount,
    }).catch(() => {});

    // Update popular searches in Redis
    this.redisService.zIncrBy('search:popular', 1, query.toLowerCase().trim())
      .catch(() => {});
  }

  async getPopularSearches(limit: number = 10): Promise<string[]> {
    // Try cache first
    const cached = await this.redisService.get('search:popular:cached');
    if (cached) {
      return JSON.parse(cached);
    }

    const popular = await this.redisService.zRevRange('search:popular', 0, limit - 1);

    // Cache for 5 minutes
    this.redisService.set('search:popular:cached', JSON.stringify(popular), 300)
      .catch(() => {});

    return popular;
  }

  async getSearchHistory(userId: number, limit: number = 10): Promise<SearchHistory[]> {
    return this.searchHistoryRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  async clearSearchHistory(userId: number): Promise<void> {
    await this.searchHistoryRepo.delete({ user_id: userId });
  }
}

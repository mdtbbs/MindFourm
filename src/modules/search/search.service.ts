import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { SearchHistory } from '@entities/search-history.entity';
import { PopularSearch } from '@entities/popular-search.entity';
import { Resource } from '@entities/resource.entity';
import { RedisService } from '../../database/redis.service';
import { escapeLike } from '../../common/utils/search.util';
import { PostSummaryDto, PostSummaryService } from '../posts/post-summary.service';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(SearchHistory)
    private searchHistoryRepo: Repository<SearchHistory>,
    @InjectRepository(PopularSearch)
    private popularSearchRepo: Repository<PopularSearch>,
    @InjectRepository(Resource)
    private resourceRepository: Repository<Resource>,
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
      .where('p.status = :status', { status: 'published' });

    // Use Full-Text search when available (ngram index handles CJK + Latin)
    if (this.hasFullTextIndex('posts')) {
      qb.andWhere(
        'MATCH(p.title, p.content) AGAINST(:query IN NATURAL LANGUAGE MODE)',
        { query },
      );
    } else {
      qb.andWhere(
        '(p.title LIKE :query OR p.content LIKE :query)',
        { query: `%${escapeLike(query)}%` },
      );
    }

    if (options.category) {
      qb.andWhere('category.slug = :category', { category: options.category });
    }

    if (options.sort === 'relevance') {
      if (this.hasFullTextIndex('posts')) {
        qb.orderBy('MATCH(p.title, p.content) AGAINST(:query IN NATURAL LANGUAGE MODE)', 'DESC');
      } else {
        qb.orderBy('CASE WHEN p.title LIKE :query THEN 1 ELSE 0 END', 'DESC');
      }
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

  /**
   * Search resources by title and description.
   * Only returns approved and public resources.
   * Uses Full-Text search when available (ngram index handles CJK + Latin).
   */
  async searchResources(query: string, limit: number = 20): Promise<any[]> {
    // Keep search on the same public-visibility contract as the resource list.
    // In particular, disabled categories must not be discoverable through a
    // separate endpoint while their list/detail/download routes are hidden.
    const qb = this.resourceRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.category', 'category')
      .where('r.status = :status', { status: 'approved' })
      .andWhere('r.is_public = :isPublic', { isPublic: 1 })
      .andWhere('(category.id IS NULL OR category.is_active = :categoryActive)', { categoryActive: 1 });

    if (this.hasFullTextIndex('resources')) {
      qb.andWhere(
        'MATCH(r.title, r.description) AGAINST(:query IN NATURAL LANGUAGE MODE)',
        { query },
      );
    } else {
      qb.andWhere('(r.title LIKE :query OR r.description LIKE :query)', {
        query: `%${escapeLike(query)}%`,
      });
    }

    const resources = await qb
      .orderBy('r.download_count', 'DESC')
      .addOrderBy('r.rating_average', 'DESC')
      .addOrderBy('r.created_at', 'DESC')
      .take(limit)
      .getMany();

    return resources.map((resource) => ({
      id: resource.id,
      title: resource.title,
      description: resource.description,
      resource_type: resource.resource_type,
      version: resource.version,
      slug: resource.slug,
      download_count: resource.download_count,
      rating_average: resource.rating_average,
      rating_count: resource.rating_count,
      category_name: resource.category?.name || null,
      username: resource.user?.username || null,
      user_id: resource.user_id,
      created_at: resource.created_at,
    }));
  }

  /**
   * Check if a table has a Full-Text index.
   * Defaults to true for tables with known FTS indexes (posts, resources).
   */
  private hasFullTextIndex(table: string): boolean {
    const tablesWithFTS = ['posts', 'resources'];
    return tablesWithFTS.includes(table);
  }

  async recordSearch(userId: number | undefined, query: string, resultsCount: number): Promise<void> {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return;

    // History belongs to a user. The controller used to pass `undefined` here, so
    // every insert failed on the user_id constraint — and the failure was swallowed
    // by an empty catch, leaving GET /api/search/history permanently empty.
    if (userId) {
      this.searchHistoryRepo.save({
        user_id: userId,
        query: normalized,
        search_type: 'global',
        results_count: resultsCount,
      }).catch((error) => {
        this.logger.warn(`Failed to record search history: ${(error as Error).message}`);
      });
    }

    // Popularity is an aggregate, so anonymous searches count towards it too.
    this.redisService.zIncrBy('search:popular', 1, normalized).catch((error) => {
      this.logger.warn(`Failed to update popular searches: ${(error as Error).message}`);
    });
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

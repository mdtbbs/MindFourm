import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { SearchHistory } from '@entities/search-history.entity';
import { PopularSearch } from '@entities/popular-search.entity';
import { SearchAudit } from '@entities/search-audit.entity';
import { GroupMember } from '@entities/group-member.entity';
import { KnowledgeArticle } from '@entities/knowledge-article.entity';
import { RedisService } from '../../database/redis.service';
import { withTimeout } from '../../common/utils/with-timeout.util';
import { escapeLike } from '../../common/utils/search.util';
import { PostSummaryDto, PostSummaryService } from '../posts/post-summary.service';
import { applyPostVisibility } from '@common/utils/post-visibility.util';
import { selectPostCards, hydratePostCardExcerpts } from '@common/utils/post-card-query.util';
import { SearchProviderRegistry } from './search-provider.registry';

export type SearchViewer = { id: number; role: string } | undefined;
export type SearchActor = { id: number; username?: string; role?: string };
export type AuditedSearchResult<T> = { value: T; resultsCount: number };
export const SEARCH_SETTINGS_READER = Symbol('SEARCH_SETTINGS_READER');
export interface SearchSettingsReader {
  get(key: string): Promise<string | null>;
}

export type UnifiedSearchGroups = {
  users: Array<{ id: number; username: string; avatar_url: string | null; bio: string | null }>;
  posts: PostSummaryDto[];
  resources: unknown[];
  servers: unknown[];
  game_versions: unknown[];
  wiki: Array<{ id: number; public_id: string; title: string; slug: string | null; summary: string | null; category: string | null }>;
  developer_feed: unknown[];
};

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
    @InjectRepository(GroupMember)
    private groupMemberRepository: Repository<GroupMember>,
    @InjectRepository(KnowledgeArticle)
    private knowledgeRepository: Repository<KnowledgeArticle>,
    private redisService: RedisService,
    private postSummaryService: PostSummaryService,
    @InjectRepository(SearchAudit)
    private searchAuditRepo?: Repository<SearchAudit>,
    @Inject(SEARCH_SETTINGS_READER)
    private settingsReader?: SearchSettingsReader,
    private readonly providerRegistry?: SearchProviderRegistry,
  ) {}

  /** Persist the actor and query before executing any search work. */
  async withSearchAudit<T>(
    actor: SearchActor,
    rawQuery: string,
    execute: (query: string) => Promise<AuditedSearchResult<T>>,
  ): Promise<T> {
    if (!this.searchAuditRepo) {
      throw new Error('Search audit storage is unavailable');
    }
    const query = String(rawQuery ?? '').trim().slice(0, 255);
    const normalized = query.toLowerCase();
    const audit = await this.searchAuditRepo.save(this.searchAuditRepo.create({
      user_id: actor.id,
      username_snapshot: String(actor.username || `user-${actor.id}`).slice(0, 100),
      query: normalized,
      status: 'started',
      blocked_reason: null,
      results_count: null,
      completed_at: null,
    }));
    let finalized = false;

    try {
      if (!normalized) {
        await this.searchAuditRepo.update(audit.id, {
          status: 'blocked',
          blocked_reason: 'empty_query',
          completed_at: new Date(),
        });
        finalized = true;
        throw new BadRequestException({ code: 'SEARCH_QUERY_REQUIRED', message: '请输入搜索关键词' });
      }

      const blockedTerm = (await this.getBlockedSearchTerms())
        .find((term) => this.matchesBlockedTerm(normalized, term));
      if (blockedTerm) {
        await this.searchAuditRepo.update(audit.id, {
          status: 'blocked',
          blocked_reason: 'policy_keyword',
          completed_at: new Date(),
        });
        finalized = true;
        throw new BadRequestException({
          code: 'SEARCH_TERM_BLOCKED',
          message: '该搜索词暂不可用',
        });
      }

      const { value, resultsCount } = await execute(query);
      await this.searchAuditRepo.update(audit.id, {
        status: 'completed',
        results_count: resultsCount,
        completed_at: new Date(),
      });
      finalized = true;
      await this.recordSearch(actor.id, normalized, resultsCount);
      return value;
    } catch (error) {
      if (!finalized) {
        await this.searchAuditRepo.update(audit.id, {
          status: 'failed',
          completed_at: new Date(),
        }).catch((auditError) => {
          this.logger.error(`Failed to finalize search audit ${audit.id}: ${(auditError as Error).message}`);
        });
      }
      throw error;
    }
  }

  private async getBlockedSearchTerms(): Promise<string[]> {
    const configured = await this.settingsReader?.get('search_blocked_keywords');
    const terms = String(configured || '').split(/[\n,，]+/u).map((term) => term.trim()).filter(Boolean);
    // This term was explicitly identified as prohibited and remains blocked even
    // if the configurable list is accidentally cleared.
    return [...new Set(['开户', ...terms])];
  }

  private matchesBlockedTerm(query: string, term: string): boolean {
    const compact = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
    return compact(query).includes(compact(term));
  }

  private async removeBlockedPopularSearches(queries: string[]): Promise<string[]> {
    const terms = await this.getBlockedSearchTerms();
    return queries.filter((query) => !terms.some((term) => this.matchesBlockedTerm(query, term)));
  }

  async searchPosts(
    query: string,
    options: { page?: number; limit?: number; category?: string; categoryId?: number; sort?: string },
    viewer?: SearchViewer,
  ): Promise<{ data: PostSummaryDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const page = Math.min(10000, Math.max(1, Math.trunc(Number(options.page)) || 1));
    const limit = Math.min(50, Math.max(1, Math.trunc(Number(options.limit)) || 20));
    const qb = this.postRepository.createQueryBuilder('p')
      .leftJoinAndSelect('p.user', 'user').leftJoinAndSelect('p.category', 'category')
      .maxExecutionTime(2500);
    selectPostCards(qb, 'p');
    applyPostVisibility(qb, 'p', viewer, 'published');
    // Keep LIKE semantics for legacy Markdown rows; deployed schemas do not yet
    // guarantee a FULLTEXT index. The selected card still reads only a body prefix.
    qb.andWhere('(p.title LIKE :query OR p.content LIKE :query)', { query: `%${escapeLike(query)}%` });
    if (options.category) qb.andWhere('category.slug = :category', { category: options.category });
    if (options.categoryId) qb.andWhere('category.id = :categoryId', { categoryId: options.categoryId });
    const direction = options.sort === 'oldest' ? 'ASC' : 'DESC';
    if (options.sort === 'relevance') {
      qb.addSelect('CASE WHEN p.title LIKE :query THEN 1 ELSE 0 END', 'search_title_match')
        .orderBy('search_title_match', 'DESC').addOrderBy('p.created_at', 'DESC');
    } else qb.orderBy('p.created_at', direction);
    qb.addOrderBy('p.id', direction).skip((page - 1) * limit).take(limit);
    const cards = await qb.getRawAndEntities();
    const total = await qb.getCount();
    const posts = hydratePostCardExcerpts(cards, 'p');
    const data = await this.postSummaryService.toSummaryList(posts);
    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async searchUsers(query: string, limit: number = 20) {
    const username = query.startsWith('@') ? query.slice(1) : query;
    const uid = this.parseUid(query);
    const exact = uid ? await this.userRepository.findOne({
      where: { id: uid },
      select: ['id', 'username', 'avatar_url', 'bio'],
    }) : null;
    return this.userRepository.find({
      where: [
        { username: Like(`%${escapeLike(username)}%`) },
        { bio: Like(`%${escapeLike(username)}%`) },
      ],
      take: limit,
      select: ['id', 'username', 'avatar_url', 'bio'],
    }).then((users) => exact && !users.some((user) => user.id === exact.id)
      ? [exact, ...users].slice(0, limit)
      : users);
  }

  /**
   * V2 unified public search. The result remains grouped so consumers do not
   * mistake a resource or developer mirror for a forum post. All visibility
   * predicates live here on the server; clients only receive already-safe cards.
   */
  async searchUnified(query: string, viewer?: SearchViewer, limit = 10): Promise<{
    groups: UnifiedSearchGroups;
    total_by_type: Record<keyof UnifiedSearchGroups, number>;
    unavailable: Array<keyof UnifiedSearchGroups>;
  }> {
    const normalized = query.trim();
    const resultLimit = Math.max(1, Math.min(limit, 20));
    const keys = ['posts', 'users', 'wiki', 'resources', 'servers', 'game_versions', 'developer_feed'] as const;
    const work = [
      this.searchPosts(normalized, { page: 1, limit: resultLimit, sort: 'relevance' }, viewer).then((result) => result.data),
      this.searchUsers(normalized, resultLimit),
      this.searchWiki(normalized, resultLimit),
      this.providerRegistry?.search('resources', normalized, { limit: resultLimit, viewer }) || Promise.resolve([]),
      this.providerRegistry?.search('servers', normalized, { limit: resultLimit, viewer }) || Promise.resolve([]),
      this.providerRegistry?.search('game_versions', normalized, { limit: resultLimit, viewer }) || Promise.resolve([]),
      this.providerRegistry?.search('developer_feed', normalized, { limit: resultLimit, viewer }) || Promise.resolve([]),
    ];
    const results = await Promise.allSettled(work.map((promise, index) => withTimeout<unknown[]>(promise, 2500, `Search ${keys[index]}`)));
    const groups = {} as UnifiedSearchGroups;
    const unavailable: Array<keyof UnifiedSearchGroups> = [];
    results.forEach((result, index) => {
      const key = keys[index];
      (groups[key] as unknown[]) = result.status === 'fulfilled' ? result.value : [];
      if (result.status === 'rejected') {
        unavailable.push(key);
        this.logger.warn(`Search provider ${key} unavailable: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`);
      }
    });
    return { groups, unavailable, total_by_type: Object.fromEntries(
      Object.entries(groups).map(([type, values]) => [type, values.length]),
    ) as Record<keyof UnifiedSearchGroups, number> };
  }

  private async searchWiki(query: string, limit: number) {
    return this.knowledgeRepository.find({
      where: [
        { status: 'published', is_public: true, title: Like(`%${escapeLike(query)}%`) },
        { status: 'published', is_public: true, summary: Like(`%${escapeLike(query)}%`) },
      ],
      order: { sort_order: 'ASC', updated_at: 'DESC' },
      take: limit,
      select: ['id', 'public_id', 'title', 'slug', 'summary', 'category'],
    });
  }

  private parseUid(query: string): number | null {
    const match = /^(?:uid:)?(\d+)$/.exec(query.trim());
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  /**
   * Search resources by title and description.
   * Only returns approved and public resources.
   * Uses Full-Text search when available (ngram index handles CJK + Latin).
   */
  async searchResources(query: string, limit: number = 20): Promise<any[]> {
    return this.providerRegistry?.search('resources', query, { limit }) || [];
  }

  async recordSearch(userId: number, query: string, resultsCount: number): Promise<void> {
    const normalized = query.toLowerCase().trim();
    if (!normalized) return;

    this.searchHistoryRepo.save({
      user_id: userId,
      query: normalized,
      search_type: 'global',
      results_count: resultsCount,
    }).catch((error) => {
      this.logger.warn(`Failed to record search history: ${(error as Error).message}`);
    });

    this.redisService.zIncrBy('search:popular', 1, normalized).catch((error) => {
      this.logger.warn(`Failed to update popular searches: ${(error as Error).message}`);
    });
  }

  async getPopularSearches(limit: number = 10): Promise<string[]> {
    // Filter even cached values so a newly blocked term disappears immediately.
    const cached = await this.redisService.get('search:popular:cached');
    if (cached) {
      return (await this.removeBlockedPopularSearches(JSON.parse(cached))).slice(0, limit);
    }

    const popular = await this.redisService.zRevRange('search:popular', 0, 199);
    const visible = (await this.removeBlockedPopularSearches(popular)).slice(0, limit);

    this.redisService.set('search:popular:cached', JSON.stringify(visible), 300)
      .catch(() => {});

    return visible;
  }

  async getSearchHistory(userId: number, limit: number = 10): Promise<SearchHistory[]> {
    return this.searchHistoryRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  async getSearchAudits(query: string | undefined, page = 1, limit = 50) {
    if (!this.searchAuditRepo) {
      throw new Error('Search audit storage is unavailable');
    }
    const safePage = Math.max(1, Math.floor(page) || 1);
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit) || 50));
    const qb = this.searchAuditRepo.createQueryBuilder('audit')
      .select([
        'audit.id', 'audit.user_id', 'audit.username_snapshot', 'audit.query',
        'audit.status', 'audit.blocked_reason', 'audit.results_count',
        'audit.created_at', 'audit.completed_at',
      ])
      .orderBy('audit.created_at', 'DESC')
      .addOrderBy('audit.id', 'DESC');
    if (query?.trim()) {
      qb.andWhere('audit.query LIKE :query', {
        query: `%${escapeLike(query.trim().toLowerCase())}%`,
      });
    }
    const [items, total] = await qb.skip((safePage - 1) * safeLimit).take(safeLimit).getManyAndCount();
    return { items, total, page: safePage, limit: safeLimit };
  }

  async clearSearchHistory(userId: number): Promise<void> {
    await this.searchHistoryRepo.delete({ user_id: userId });
  }
}

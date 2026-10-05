import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
import { SearchOptions, SearchProviderRegistry } from './search-provider.registry';
import { SiteConfigService } from '../../config/site-profile';

export type SearchViewer = { id: number; role: string; preferred_content_language?: string | null } | undefined;
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

export type UnifiedSearchOptions = {
  type?: string;
  category?: string;
  sort?: string;
  page?: number;
  limit?: number;
  content_language?: string;
  resource_kind?: 'mod' | 'map' | 'schematic';
};

export type UnifiedSearchResult = {
  groups: UnifiedSearchGroups;
  total_by_type: Record<keyof UnifiedSearchGroups, number>;
  unavailable: Array<keyof UnifiedSearchGroups>;
  pagination: { page: number; limit: number; has_more: boolean };
  suggested_query?: string;
};

type UnifiedSearchKey = keyof UnifiedSearchGroups;

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
    @Optional() private readonly siteConfig?: SiteConfigService,
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

  /**
   * Return suggestions only from the aggregate public popularity list. User
   * search history is deliberately never consulted by this endpoint.
   */
  async getSearchSuggestions(rawQuery: string, limit = 8): Promise<string[]> {
    const normalized = String(rawQuery ?? '').normalize('NFKC').trim().toLowerCase().slice(0, 64);
    const characters = Array.from(normalized);
    if (characters.length < 2) return [];

    // Reuse only the ten terms that are already published by the legacy public
    // popular-search surface; never expand suggestions from private histories.
    const popular = await this.getPopularSearches(10);
    const normalizedPopular = popular.map((query, index) => ({
      query,
      normalized: query.normalize('NFKC').trim().toLowerCase(),
      index,
    })).filter((item) => item.normalized.length > 0);
    const prefixMatches = normalizedPopular.filter((item) => item.normalized.startsWith(normalized));
    if (prefixMatches.length) return prefixMatches.slice(0, Math.max(1, Math.min(limit, 12))).map((item) => item.query);

    // A single edit is a predictable correction fallback. Keep it off short
    // inputs to avoid broad/noisy matches, and examine at most ten public terms.
    if (characters.length < 4) return [];
    return normalizedPopular
      .map((item) => ({ ...item, distance: this.editDistanceAtMostOne(characters, Array.from(item.normalized)) }))
      .filter((item) => item.distance !== null)
      .sort((left, right) => left.distance! - right.distance! || left.index - right.index)
      .slice(0, Math.max(1, Math.min(limit, 12)))
      .map((item) => item.query);
  }

  private editDistanceAtMostOne(left: string[], right: string[]): number | null {
    if (Math.abs(left.length - right.length) > 1) return null;
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) { i++; j++; continue; }
      if (++edits > 1) return null;
      if (left.length > right.length) i++;
      else if (right.length > left.length) j++;
      else { i++; j++; }
    }
    if (i < left.length || j < right.length) edits++;
    return edits <= 1 ? edits : null;
  }

  private async removeBlockedPopularSearches(queries: string[]): Promise<string[]> {
    const terms = await this.getBlockedSearchTerms();
    return queries.filter((query) => !terms.some((term) => this.matchesBlockedTerm(query, term)));
  }

  async searchPosts(
    query: string,
    options: { page?: number; limit?: number; category?: string; categoryId?: number; sort?: string; content_language?: string; preferred_content_language?: string | null },
    viewer?: SearchViewer,
  ): Promise<{ data: PostSummaryDto[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const page = Math.min(10000, Math.max(1, Math.trunc(Number(options.page)) || 1));
    const limit = Math.min(50, Math.max(1, Math.trunc(Number(options.limit)) || 20));
    const replyBlockPredicate = viewer?.id ? `AND NOT EXISTS (
      SELECT 1 FROM user_blocks reply_search_block
      WHERE (reply_search_block.blocker_id = :searchViewerId AND reply_search_block.blocked_id = search_reply.user_id)
         OR (reply_search_block.blocker_id = search_reply.user_id AND reply_search_block.blocked_id = :searchViewerId)
    )` : '';
    const qb = this.postRepository.createQueryBuilder('p')
      .leftJoinAndSelect('p.user', 'user').leftJoinAndSelect('p.category', 'category')
      .maxExecutionTime(2500);
    selectPostCards(qb, 'p');
    applyPostVisibility(qb, 'p', viewer, 'published');
    // Keep LIKE semantics alongside FULLTEXT for substring matches and parsers
    // that do not tokenize CJK content. The selected card still reads only a body prefix.
    qb.andWhere(`(p.title LIKE :query OR p.content LIKE :query
      OR MATCH(p.title, p.content) AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE)
      OR category.name LIKE :query OR category.slug LIKE :query
      OR MATCH(category.name, category.slug, category.description) AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE)
      OR EXISTS (
        SELECT 1 FROM replies search_reply
        WHERE search_reply.post_id = p.id AND search_reply.status = 'published'
          AND search_reply.deleted_at IS NULL
          ${replyBlockPredicate}
          AND (search_reply.content LIKE :query OR MATCH(search_reply.content) AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE))
      )
      OR EXISTS (
        SELECT 1 FROM post_tags search_post_tag
        INNER JOIN tags search_tag ON search_tag.id = search_post_tag.tag_id
        WHERE search_post_tag.post_id = p.id AND (search_tag.name LIKE :query OR search_tag.slug LIKE :query
          OR MATCH(search_tag.name, search_tag.slug) AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE))
      ))`, { query: `%${escapeLike(query)}%`, fullTextQuery: query.trim() });
    if (viewer?.id) {
      qb.andWhere(`NOT EXISTS (
        SELECT 1 FROM user_blocks search_block
        WHERE (search_block.blocker_id = :searchViewerId AND search_block.blocked_id = p.user_id)
           OR (search_block.blocker_id = p.user_id AND search_block.blocked_id = :searchViewerId)
      )`, { searchViewerId: viewer.id });
    }
    const preferredContentLanguage = this.siteConfig?.current.contentLanguagePreference
      ? options.preferred_content_language || viewer?.preferred_content_language || null
      : null;
    if (options.content_language) {
      qb.andWhere('p.content_language = :contentLanguage', { contentLanguage: options.content_language });
    }
    if (options.category) qb.andWhere('category.slug = :category', { category: options.category });
    if (options.categoryId) qb.andWhere('category.id = :categoryId', { categoryId: options.categoryId });
    const direction = options.sort === 'oldest' ? 'ASC' : 'DESC';
    if (options.sort === 'relevance') {
      if (preferredContentLanguage) {
        qb.addSelect('CASE WHEN p.content_language = :preferredContentLanguage THEN 1 ELSE 0 END', 'search_language_match')
          .orderBy('search_language_match', 'DESC');
        (qb as any).setParameter?.('preferredContentLanguage', preferredContentLanguage);
      }
      qb.addSelect('CASE WHEN p.title LIKE :query THEN 1 ELSE 0 END', 'search_title_match')
        .addOrderBy('search_title_match', 'DESC').addOrderBy('p.created_at', 'DESC');
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

  private async searchUsersPage(query: string, options: { page: number; limit: number }, viewer?: SearchViewer) {
    const username = query.startsWith('@') ? query.slice(1) : query;
    const uid = this.parseUid(query);
    const repository = this.userRepository as Repository<User> & { createQueryBuilder?: Repository<User>['createQueryBuilder'] };
    if (!repository.createQueryBuilder) {
      const items = await this.searchUsers(query, options.page * options.limit);
      const start = (options.page - 1) * options.limit;
      return { items: items.slice(start, start + options.limit), total: items.length };
    }

    const qb = repository.createQueryBuilder('user')
      .select(['user.id', 'user.username', 'user.avatar_url', 'user.bio'])
      .maxExecutionTime(2500)
      .where(`((user.username LIKE :username OR user.bio LIKE :username OR user.id = :uid)
        OR MATCH(user.username, user.bio) AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE))`, {
        username: `%${escapeLike(username)}%`, uid: uid || -1, fullTextQuery: username.trim(),
      });
    if (viewer?.id) {
      qb.andWhere(`NOT EXISTS (
        SELECT 1 FROM user_blocks search_block
        WHERE (search_block.blocker_id = :searchViewerId AND search_block.blocked_id = user.id)
           OR (search_block.blocker_id = user.id AND search_block.blocked_id = :searchViewerId)
      )`, { searchViewerId: viewer.id });
    }
    const [items, total] = await qb.orderBy(uid ? 'CASE WHEN user.id = :uid THEN 0 ELSE 1 END' : 'user.username', 'ASC')
      .addOrderBy('user.id', 'ASC')
      .skip((options.page - 1) * options.limit).take(options.limit).getManyAndCount();
    return { items, total };
  }

  /**
   * V2 unified public search. The result remains grouped so consumers do not
   * mistake a resource or developer mirror for a forum post. All visibility
   * predicates live here on the server; clients only receive already-safe cards.
   */
  async searchUnified(query: string, viewer?: SearchViewer, optionsOrLimit: UnifiedSearchOptions | number = 10, legacyContentLanguage?: string): Promise<UnifiedSearchResult> {
    const normalized = query.trim();
    const options = typeof optionsOrLimit === 'number'
      ? { limit: optionsOrLimit, content_language: legacyContentLanguage }
      : optionsOrLimit;
    const page = Math.min(10000, Math.max(1, Math.trunc(Number(options.page)) || 1));
    const resultLimit = Math.max(1, Math.min(Math.trunc(Number(options.limit)) || 10, 50));
    const allKeys = ['posts', 'users', 'wiki', 'resources', 'servers', 'game_versions', 'developer_feed'] as const;
    const selectedType = options.type || 'all';
    const typeKey = this.searchTypeToKey(selectedType);
    const resourceKind = options.resource_kind || (['mod', 'map', 'schematic'].includes(selectedType)
      ? selectedType as 'mod' | 'map' | 'schematic'
      : undefined);
    const keys = (typeKey ? [typeKey] : allKeys) as readonly UnifiedSearchKey[];
    const enabledProviders = new Set(this.siteConfig?.current.searchProviders || keys);
    const preferredContentLanguage = this.siteConfig?.current.contentLanguagePreference
      ? viewer?.preferred_content_language
      : undefined;
    const requestProvider = async (key: UnifiedSearchKey) => {
      if (!enabledProviders.has(key)) return { items: [], total: 0 };
      if (key === 'posts') {
        const result = await this.searchPosts(normalized, {
          page, limit: resultLimit, sort: options.sort || 'relevance', category: options.category,
          content_language: options.content_language, preferred_content_language: preferredContentLanguage,
        }, viewer);
        return { items: result.data, total: result.pagination.total };
      }
      if (key === 'users') return this.searchUsersPage(normalized, { page, limit: resultLimit }, viewer);
      if (key === 'wiki') return this.searchWikiPage(normalized, { page, limit: resultLimit });
      const providerOptions = {
        page, limit: resultLimit, viewer, category: options.category,
        sort: options.sort as SearchOptions['sort'], resource_kind: resourceKind,
        ...(key === 'resources' ? {
          content_language: options.content_language,
          preferred_content_language: preferredContentLanguage,
        } : {}),
      };
      const registry = this.providerRegistry as (SearchProviderRegistry & {
        searchGroup?: (providerKey: string, searchQuery: string, providerOptions: SearchOptions) => Promise<{ items: unknown[]; total?: number }>;
      }) | undefined;
      if (registry?.searchGroup) return registry.searchGroup(key, normalized, providerOptions);
      const items = await registry?.search(key, normalized, providerOptions) || [];
      return { items: items as unknown[], total: items.length };
    };
    const resultEntries = await Promise.all(keys.map(async (key) => [
      key,
      await Promise.allSettled([withTimeout(requestProvider(key), 2500, `Search ${key}`)]),
    ] as const));
    const groups = {} as UnifiedSearchGroups;
    const unavailable: Array<keyof UnifiedSearchGroups> = [];
    const totalByType = {} as Record<keyof UnifiedSearchGroups, number>;
    for (const [key, settled] of resultEntries) {
      const result = settled[0];
      if (result.status === 'fulfilled') {
        (groups[key] as unknown[]) = result.value.items;
        totalByType[key] = result.value.total ?? result.value.items.length;
      } else {
        (groups[key] as unknown[]) = [];
        totalByType[key] = 0;
      }
      if (result.status === 'rejected') {
        unavailable.push(key);
        this.logger.warn(`Search provider ${key} unavailable: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`);
      }
    }
    for (const key of allKeys) {
      if (!(key in groups)) (groups[key] as unknown[]) = [];
      if (!(key in totalByType)) totalByType[key] = 0;
    }
    return {
      groups, unavailable, total_by_type: totalByType,
      pagination: { page, limit: resultLimit, has_more: keys.some((key) => totalByType[key] > page * resultLimit) },
    };
  }

  /** Search exact first, then use a bounded public-popularity typo suggestion. */
  async searchUnifiedWithSuggestion(query: string, viewer?: SearchViewer, options: UnifiedSearchOptions = {}): Promise<UnifiedSearchResult> {
    const exact = await this.searchUnified(query, viewer, options);
    if (Object.values(exact.total_by_type).some((count) => count > 0)) return exact;

    const [suggestion] = await this.getSearchSuggestions(query, 1);
    if (!suggestion || suggestion.normalize('NFKC').trim().toLowerCase() === query.normalize('NFKC').trim().toLowerCase()) return exact;
    const corrected = await this.searchUnified(suggestion, viewer, options);
    if (!Object.values(corrected.total_by_type).some((count) => count > 0)) return exact;
    return { ...corrected, suggested_query: suggestion };
  }

  private searchTypeToKey(type: string): UnifiedSearchKey | null {
    switch (type) {
      case 'all': case 'global': return null;
      case 'post': case 'posts': return 'posts';
      case 'user': case 'users': return 'users';
      case 'wiki': case 'knowledge': return 'wiki';
      case 'resource': case 'resources': case 'mod': case 'map': case 'schematic': return 'resources';
      case 'server': case 'servers': return 'servers';
      case 'game_version': case 'game_versions': return 'game_versions';
      case 'developer_feed': return 'developer_feed';
      default: return null;
    }
  }

  private async searchWikiPage(query: string, options: { page: number; limit: number }) {
    if (this.knowledgeRepository.createQueryBuilder) {
      const [items, total] = await this.knowledgeRepository.createQueryBuilder('article')
      .select(['article.id', 'article.public_id', 'article.title', 'article.slug', 'article.summary', 'article.category'])
        .maxExecutionTime(2500)
        .where(`article.status = 'published' AND article.is_public = 1 AND (
          article.title LIKE :query OR article.slug LIKE :query OR article.summary LIKE :query OR article.content_markdown LIKE :query OR article.category LIKE :query
          OR MATCH(article.title, article.slug, article.summary, article.content_markdown, article.category)
            AGAINST (:fullTextQuery IN NATURAL LANGUAGE MODE)
        )`, { query: `%${escapeLike(query)}%`, fullTextQuery: query.trim() })
        .orderBy('article.sort_order', 'ASC').addOrderBy('article.updated_at', 'DESC')
        .skip((options.page - 1) * options.limit).take(options.limit).getManyAndCount();
      return { items, total };
    }
    const where = [
      { status: 'published', is_public: true, title: Like(`%${escapeLike(query)}%`) },
      { status: 'published', is_public: true, summary: Like(`%${escapeLike(query)}%`) },
    ];
    const pagination = {
      order: { sort_order: 'ASC' as const, updated_at: 'DESC' as const },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
      select: ['id', 'public_id', 'title', 'slug', 'summary', 'category'] as Array<'id' | 'public_id' | 'title' | 'slug' | 'summary' | 'category'>,
    };
    if (this.knowledgeRepository.findAndCount) {
      const [items, total] = await this.knowledgeRepository.findAndCount({ where, ...pagination });
      return { items, total };
    }
    const items = await this.knowledgeRepository.find({ where, ...pagination });
    return { items, total: items.length };
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

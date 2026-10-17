import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { Category } from '@entities/category.entity';
import { KnowledgeArticle } from '@entities/knowledge-article.entity';
import { Notice } from '@entities/notice.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { RedisService } from '@database/redis.service';
import { PostSummaryDto, PostSummaryService } from '../posts/post-summary.service';
import { PortalSectionRegistry } from './portal-section.registry';
import { selectPostCards, hydratePostCardExcerpts } from '../../common/utils/post-card-query.util';
import { applyPublicPostVisibility } from '../../common/utils/post-visibility.util';
import { withTimeout } from '@common/utils/with-timeout.util';
import { PUBLIC_RESOURCE_STATUSES } from '@common/utils/constants';
import { RESOURCE_KINDS } from '../resources/resource-kind-registry';

/** The legacy `/v1/portal` surface; kept while `/v1/home` becomes the web read model. */
export type PortalModule = { key: string; title: string; hidden: boolean; items: any[] };
export type PortalData = { modules: PortalModule[]; generated_at: string };

export type HomeSectionState = 'ready' | 'stale' | 'unavailable';
export type HomeSection<T> = { state: HomeSectionState; items: T[] };
export type HomeResource = { id: number; title: string; slug: string | null; resource_kind: string | null; version: string | null; content_language: string; updated_at: string; author_name: string | null; category_name: string | null; description: string | null; preview_url: string | null };
export type HomeNotice = { id: number; public_id: string; title: string; excerpt: string | null; published_at: string | null };
export type HomeNews = { id: number; title: string; slug: string | null; category: string | null };
export type HomeDeveloperEntry = { id: number; category_id: number | null; external_id: string; title: string; state: string; url: string; repository: string; updated_at: string };

/** One board entry, flattened and ordered for the homepage board grid. */
export type HomeBoard = { id: number; name: string; slug: string | null; icon: string | null; color: string | null; description: string | null; group: string | null; post_count: number; depth: 0 | 1 };
/** One resource-kind entry, using the same registry order as the resource sidebar. */
export type HomeResourceKind = { kind: string; label: string; count: number };
/** Aggregate numbers shown by the strip under the fold. */
export type HomeStats = { posts: number; replies: number; members: number; resources: number; today_posts: number };

export type HomeData = {
  discussions: HomeSection<PostSummaryDto>;
  resources: HomeSection<HomeResource>;
  news: HomeSection<HomeNews>;
  notices: HomeSection<HomeNotice>;
  development: { issues: HomeSection<HomeDeveloperEntry>; pull_requests: HomeSection<HomeDeveloperEntry> };
  /** Server-owned navigation/summary so the homepage never assembles its own boards. */
  boards: HomeBoard[];
  resource_kinds: HomeResourceKind[];
  stats: HomeStats | null;
  generated_at: string;
};

type CachedHomeData = HomeData & { cached_at: string };
const HOME_CACHE_KEY = 'cache:home:v3';

/** Notice types that are legal artifacts, not an announcement slot. */
const OPERATIONAL_NOTICE_TYPES = ['system', 'maintenance', 'event', 'release'];
const HOME_CACHE_FRESH_SECONDS = 60;
const HOME_CACHE_STALE_SECONDS = 10 * 60;

/**
 * Homepage read model. A homepage is an aggregation boundary, not a transaction:
 * a partial outage must not hide unrelated community content.
 */
@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);
  private refreshInFlight: Promise<void> | null = null;
  private coldBuildInFlight: Promise<HomeData> | null = null;

  constructor(
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(ResourceCategory) private readonly resourceCategoryRepo: Repository<ResourceCategory>,
    @InjectRepository(KnowledgeArticle) private readonly knowledgeRepo: Repository<KnowledgeArticle>,
    @InjectRepository(Notice) private readonly noticeRepo: Repository<Notice>,
    private readonly redisService: RedisService,
    private readonly postSummaryService: PostSummaryService,
    private readonly sectionRegistry: PortalSectionRegistry,
  ) {}

  /** Compatibility response for existing V1 clients. */
  async getPortalData(): Promise<PortalData> {
    const home = await this.getHomeData();
    const versions = await this.sectionRegistry.getSection('versions').catch(() => []);
    const modules: PortalModule[] = [
      this.toPortalModule('latest_resources', '最新资源', home.resources.items),
      this.toPortalModule('latest_threads', '最新讨论', home.discussions.items),
      this.toPortalModule('knowledge', '知识文章', home.news.items),
      this.toPortalModule('versions', this.sectionRegistry.getTitle('versions', '版本'), versions),
    ];
    return { modules, generated_at: home.generated_at };
  }

  /** Serve stale data immediately while one best-effort refresh runs in the background. */
  async getHomeData(): Promise<HomeData> {
    const cached = await this.readCachedHome();
    if (cached) {
      const ageSeconds = (Date.now() - Date.parse(cached.cached_at)) / 1000;
      if (Number.isFinite(ageSeconds) && ageSeconds < HOME_CACHE_FRESH_SECONDS) return this.withCacheState(cached, 'ready');
      this.scheduleRefresh(cached);
      return this.withCacheState(cached, 'stale');
    }
    if (!this.coldBuildInFlight) {
      this.coldBuildInFlight = this.buildHomeData()
        .then(async (home) => { await this.writeCachedHome(home); return home; })
        .finally(() => { this.coldBuildInFlight = null; });
    }
    return this.coldBuildInFlight;
  }

  private toPortalModule(key: string, title: string, items: any[]): PortalModule {
    return { key, title, hidden: items.length === 0, items };
  }

  private async buildHomeData(previous?: HomeData): Promise<HomeData> {
    const results = await Promise.allSettled([
      withTimeout(this.getLatestCommunityDiscussions(), 2500, 'Home discussions'),
      withTimeout(this.sectionRegistry.getSection<HomeResource>('resources'), 2500, 'Home resources'),
      withTimeout(this.getNews(), 2500, 'Home news'),
      withTimeout(this.getNotices(), 2500, 'Home notices'),
      withTimeout(this.sectionRegistry.getSection<HomeDeveloperEntry>('development:issues'), 2500, 'Home issues'),
      withTimeout(this.sectionRegistry.getSection<HomeDeveloperEntry>('development:pull_requests'), 2500, 'Home pull requests'),
      withTimeout(this.getBoards(), 2500, 'Home boards'),
      withTimeout(this.getResourceKinds(), 2500, 'Home resource kinds'),
      withTimeout(this.getCommunityStats(), 2500, 'Home stats'),
    ] as const);
    return {
      discussions: this.sectionFrom(results[0], previous?.discussions),
      resources: this.sectionFrom(results[1], previous?.resources),
      news: this.sectionFrom(results[2], previous?.news),
      notices: this.sectionFrom(results[3], previous?.notices),
      development: {
        issues: this.sectionFrom(results[4], previous?.development.issues),
        pull_requests: this.sectionFrom(results[5], previous?.development.pull_requests),
      },
      boards: this.listFrom(results[6], previous?.boards),
      resource_kinds: this.listFrom(results[7], previous?.resource_kinds),
      stats: results[8].status === 'fulfilled' ? results[8].value : previous?.stats ?? null,
      generated_at: new Date().toISOString(),
    };
  }

  /** Non-critical arrays (boards, kinds) degrade to the previous value, then to empty. */
  private listFrom<T>(result: PromiseSettledResult<T[]>, previous?: T[]): T[] {
    if (result.status === 'fulfilled') return result.value;
    this.logger.warn(`Home section unavailable: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    return previous ?? [];
  }

  private sectionFrom<T>(result: PromiseSettledResult<T[]>, previous?: HomeSection<T>): HomeSection<T> {
    if (result.status === 'fulfilled') return { state: 'ready', items: result.value };
    this.logger.warn(`Home section unavailable: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    if (previous?.items?.length) return { state: 'stale', items: previous.items };
    return { state: 'unavailable', items: [] };
  }

  private withCacheState(cached: CachedHomeData, state: Extract<HomeSectionState, 'ready' | 'stale'>): HomeData {
    const applyState = <T>(section: HomeSection<T>): HomeSection<T> => ({
      ...section,
      // Never turn a known failed, empty module into a deceptively successful one
      // merely because the aggregate cache itself is readable.
      state: section.state === 'unavailable' ? 'unavailable' : section.state === 'stale' ? 'stale' : state,
    });
    return {
      discussions: applyState(cached.discussions), resources: applyState(cached.resources),
      news: applyState(cached.news), notices: applyState(cached.notices),
      development: { issues: applyState(cached.development.issues), pull_requests: applyState(cached.development.pull_requests) },
      boards: cached.boards, resource_kinds: cached.resource_kinds, stats: cached.stats,
      generated_at: cached.generated_at,
    };
  }

  private scheduleRefresh(previous: CachedHomeData): void {
    if (this.refreshInFlight) return;
    this.refreshInFlight = this.buildHomeData(previous)
      .then((home) => this.writeCachedHome(home))
      .catch((error) => this.logger.warn(`Home refresh failed: ${(error as Error).message}`))
      .finally(() => { this.refreshInFlight = null; });
  }

  private async readCachedHome(): Promise<CachedHomeData | null> {
    const raw = await this.redisService.get(HOME_CACHE_KEY);
    if (!raw) return null;
    try {
      const cached = JSON.parse(raw) as CachedHomeData;
      if (!cached.cached_at || !cached.discussions || !cached.development) throw new Error('invalid shape');
      // Older cache entries predate the board/stats fields; treat them as a miss
      // rather than serving a homepage with a silently empty board grid.
      if (!Array.isArray(cached.boards) || !Array.isArray(cached.resource_kinds)) throw new Error('legacy shape');
      if (cached.stats === undefined) cached.stats = null;
      return cached;
    } catch {
      await this.redisService.del(HOME_CACHE_KEY).catch(() => undefined);
      return null;
    }
  }

  private async writeCachedHome(home: HomeData): Promise<void> {
    const cached: CachedHomeData = { ...home, cached_at: new Date().toISOString() };
    await this.redisService.set(HOME_CACHE_KEY, JSON.stringify(cached), HOME_CACHE_STALE_SECONDS).catch((error) => {
      this.logger.warn(`Home cache write failed: ${(error as Error).message}`);
    });
  }

  private async getLatestCommunityDiscussions(): Promise<PostSummaryDto[]> {
    const qb = this.postRepo.createQueryBuilder('post').leftJoin('post.user', 'user').leftJoin('post.category', 'category');
    selectPostCards(qb);
    applyPublicPostVisibility(qb);
    qb.andWhere('post.source = :source', { source: 'USER' }).orderBy('post.last_activity_at', 'DESC').addOrderBy('post.id', 'DESC').take(6).maxExecutionTime(2500);
    const posts = hydratePostCardExcerpts(await qb.getRawAndEntities());
    return this.postSummaryService.toSummaryList(posts);
  }

  private async getNews(): Promise<HomeNews[]> {
    const rows = await this.knowledgeRepo.find({ where: { status: 'published' as any, is_public: true }, order: { updated_at: 'DESC', id: 'DESC' }, take: 4, select: ['id', 'title', 'slug', 'category'] });
    return rows.map((row) => ({ id: row.id, title: row.title, slug: row.slug || null, category: row.category || null }));
  }

  /**
   * Announcement slot for the homepage rail. `policy` notices are legal documents
   * (版权与知识产权声明 and friends), and pairing them with operational
   * announcements pushes the notice people actually need off the list. They stay
   * reachable from the footer and `/notices`.
   */
  private async getNotices(): Promise<HomeNotice[]> {
    const rows = await this.noticeRepo.createQueryBuilder('notice').select(['notice.id', 'notice.public_id', 'notice.title', 'notice.excerpt', 'notice.published_at']).maxExecutionTime(2500).where('notice.deleted_at IS NULL').andWhere('notice.status = :status', { status: 'published' })
      .andWhere('notice.published_at IS NOT NULL AND notice.published_at <= NOW()')
      .andWhere('notice.notice_type IN (:...operationalNoticeTypes)', { operationalNoticeTypes: OPERATIONAL_NOTICE_TYPES })
      .orderBy('notice.is_pinned', 'DESC').addOrderBy('notice.published_at', 'DESC').take(3).getMany();
    return rows.map((notice) => ({ id: notice.id, public_id: notice.public_id, title: notice.title, excerpt: notice.excerpt, published_at: notice.published_at?.toISOString() || null }));
  }


  /**
   * Boards for the homepage grid. Unlike `/v1/navigation`, this keeps boards the
   * operator hid from the sidebar: the homepage is a directory, and hiding an
   * entry from the rail should not hide the board from the site.
   */
  private async getBoards(): Promise<HomeBoard[]> {
    const rows = await this.categoryRepo.createQueryBuilder('category')
      .leftJoin('category.posts', 'post').addSelect('COUNT(post.id)', 'post_count')
      .where('category.is_active = :isActive', { isActive: 1 })
      .groupBy('category.id').orderBy('category.sort_order', 'ASC').addOrderBy('category.id', 'ASC')
      .maxExecutionTime(2500).getRawMany();
    const children = new Map<number, Record<string, unknown>[]>();
    for (const row of rows) {
      const parentId = row.category_parent_id == null ? null : Number(row.category_parent_id);
      if (parentId == null) continue;
      children.set(parentId, [...(children.get(parentId) ?? []), row]);
    }
    const toBoard = (row: Record<string, unknown>, depth: 0 | 1): HomeBoard => ({
      id: Number(row.category_id), name: String(row.category_name || ''), slug: row.category_slug == null ? null : String(row.category_slug),
      icon: row.category_icon == null ? null : String(row.category_icon), color: row.category_color == null ? null : String(row.category_color),
      description: row.category_description == null ? null : String(row.category_description),
      group: row.category_group_key == null ? null : String(row.category_group_key),
      post_count: Number.parseInt(String(row.post_count ?? 0), 10) || 0, depth,
    });
    const visibleIds = new Set(rows.map((row) => Number(row.category_id)));
    return rows
      .filter((row) => row.category_parent_id == null || !visibleIds.has(Number(row.category_parent_id)))
      .flatMap((row) => [toBoard(row, 0), ...(children.get(Number(row.category_id)) ?? []).map((child) => toBoard(child, 1))]);
  }

  /** Resource kinds come from the shared registry; only the counts are queried. */
  private async getResourceKinds(): Promise<HomeResourceKind[]> {
    const statuses = PUBLIC_RESOURCE_STATUSES.map((status) => `'${status}'`).join(', ');
    const rows: Array<Record<string, unknown>> = await this.postRepo.manager.query(`
      SELECT resource_kind as kind, COUNT(*) as total
        FROM resources
       WHERE deleted_at IS NULL AND is_public = 1 AND status IN (${statuses})
         AND (visibility IS NULL OR visibility = 'public')
       GROUP BY resource_kind
    `);
    const counts = new Map(rows.map((row) => [String(row.kind), Number.parseInt(String(row.total ?? 0), 10) || 0]));
    return RESOURCE_KINDS
      .map((kind) => ({ kind: kind.value, label: kind.label, count: counts.get(kind.value) ?? 0 }))
      .filter((kind) => kind.count > 0);
  }

  /** One row of counts; `today_posts` uses the site-local day boundary MySQL already applies. */
  private async getCommunityStats(): Promise<HomeStats> {
    const statuses = PUBLIC_RESOURCE_STATUSES.map((status) => `'${status}'`).join(', ');
    const [row] = await this.postRepo.manager.query(`
      SELECT
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 'published') as posts,
        (SELECT COUNT(*) FROM replies WHERE deleted_at IS NULL AND status = 'published') as replies,
        (SELECT COUNT(*) FROM users) as members,
        (SELECT COUNT(*) FROM resources WHERE deleted_at IS NULL AND is_public = 1 AND status IN (${statuses})) as resources,
        (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL AND status = 'published' AND created_at >= CURDATE()) as today_posts
    `);
    const toNumber = (value: unknown) => Number.parseInt(String(value ?? 0), 10) || 0;
    return { posts: toNumber(row?.posts), replies: toNumber(row?.replies), members: toNumber(row?.members), resources: toNumber(row?.resources), today_posts: toNumber(row?.today_posts) };
  }
}

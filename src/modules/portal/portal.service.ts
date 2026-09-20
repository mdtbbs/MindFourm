import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { Post } from '@entities/post.entity';
import { KnowledgeArticle } from '@entities/knowledge-article.entity';
import { GameVersion } from '@entities/game-version.entity';
import { Notice } from '@entities/notice.entity';
import { DeveloperFeedEntry } from '@entities/developer-feed-entry.entity';
import { RedisService } from '@database/redis.service';
import { PostSummaryDto, PostSummaryService } from '../posts/post-summary.service';

/** The legacy `/v1/portal` surface; kept while `/v1/home` becomes the web read model. */
export type PortalModule = { key: string; title: string; hidden: boolean; items: any[] };
export type PortalData = { modules: PortalModule[]; generated_at: string };

export type HomeSectionState = 'ready' | 'stale' | 'unavailable';
export type HomeSection<T> = { state: HomeSectionState; items: T[] };
export type HomeResource = { id: number; title: string; slug: string | null; resource_kind: string | null; version: string | null; updated_at: string; author_name: string | null; category_name: string | null };
export type HomeNotice = { id: number; public_id: string; title: string; excerpt: string | null; published_at: string | null };
export type HomeNews = { id: number; title: string; slug: string | null; category: string | null };
export type HomeDeveloperEntry = { id: number; external_id: string; title: string; state: string; url: string; repository: string; updated_at: string };

export type HomeData = {
  discussions: HomeSection<PostSummaryDto>;
  resources: HomeSection<HomeResource>;
  news: HomeSection<HomeNews>;
  notices: HomeSection<HomeNotice>;
  development: { issues: HomeSection<HomeDeveloperEntry>; pull_requests: HomeSection<HomeDeveloperEntry> };
  generated_at: string;
};

type CachedHomeData = HomeData & { cached_at: string };
const HOME_CACHE_KEY = 'cache:home:v1';
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

  constructor(
    @InjectRepository(Resource) private readonly resourceRepo: Repository<Resource>,
    @InjectRepository(Post) private readonly postRepo: Repository<Post>,
    @InjectRepository(KnowledgeArticle) private readonly knowledgeRepo: Repository<KnowledgeArticle>,
    @InjectRepository(GameVersion) private readonly versionRepo: Repository<GameVersion>,
    @InjectRepository(Notice) private readonly noticeRepo: Repository<Notice>,
    @InjectRepository(DeveloperFeedEntry) private readonly developerFeedRepo: Repository<DeveloperFeedEntry>,
    private readonly redisService: RedisService,
    private readonly postSummaryService: PostSummaryService,
  ) {}

  /** Compatibility response for existing V1 clients. */
  async getPortalData(): Promise<PortalData> {
    const home = await this.getHomeData();
    const versions = await this.getVersions().catch(() => []);
    const modules: PortalModule[] = [
      this.toPortalModule('latest_resources', '最新资源', home.resources.items),
      this.toPortalModule('latest_threads', '最新讨论', home.discussions.items),
      this.toPortalModule('knowledge', '知识文章', home.news.items),
      this.toPortalModule('versions', 'Mindustry 版本', versions),
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
    const home = await this.buildHomeData();
    await this.writeCachedHome(home);
    return home;
  }

  private toPortalModule(key: string, title: string, items: any[]): PortalModule {
    return { key, title, hidden: items.length === 0, items };
  }

  private async buildHomeData(previous?: HomeData): Promise<HomeData> {
    const results = await Promise.allSettled([
      this.getLatestCommunityDiscussions(), this.getLatestResources(), this.getNews(), this.getNotices(),
      this.getDeveloperEntries('issue'), this.getDeveloperEntries('pull_request'),
    ]);
    return {
      discussions: this.sectionFrom(results[0], previous?.discussions),
      resources: this.sectionFrom(results[1], previous?.resources),
      news: this.sectionFrom(results[2], previous?.news),
      notices: this.sectionFrom(results[3], previous?.notices),
      development: {
        issues: this.sectionFrom(results[4], previous?.development.issues),
        pull_requests: this.sectionFrom(results[5], previous?.development.pull_requests),
      },
      generated_at: new Date().toISOString(),
    };
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
      state: section.state === 'unavailable' ? 'unavailable' : state,
    });
    return {
      discussions: applyState(cached.discussions), resources: applyState(cached.resources),
      news: applyState(cached.news), notices: applyState(cached.notices),
      development: { issues: applyState(cached.development.issues), pull_requests: applyState(cached.development.pull_requests) },
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
    const posts = await this.postRepo.find({ where: { status: 'published', source: 'USER' }, relations: ['user', 'category'], order: { last_activity_at: 'DESC', id: 'DESC' }, take: 6 });
    return this.postSummaryService.toSummaryList(posts);
  }

  private async getLatestResources(): Promise<HomeResource[]> {
    const resources = await this.resourceRepo.createQueryBuilder('resource')
      .leftJoinAndSelect('resource.user', 'user').leftJoinAndSelect('resource.category', 'category')
      .where('resource.status IN (:...statuses)', { statuses: ['approved', 'published'] }).andWhere('resource.is_public = :isPublic', { isPublic: 1 })
      .andWhere('(category.id IS NULL OR category.is_active = :categoryActive)', { categoryActive: 1 })
      .orderBy('resource.updated_at', 'DESC').addOrderBy('resource.id', 'DESC').take(6).getMany();
    return resources.map((resource) => ({ id: resource.id, title: resource.title, slug: resource.slug || null, resource_kind: resource.resource_kind || null, version: resource.version || null, updated_at: resource.updated_at.toISOString(), author_name: resource.user?.username || null, category_name: resource.category?.name || null }));
  }

  private async getNews(): Promise<HomeNews[]> {
    const rows = await this.knowledgeRepo.find({ where: { status: 'published' as any, is_public: true }, order: { updated_at: 'DESC', id: 'DESC' }, take: 4, select: ['id', 'title', 'slug', 'category'] });
    return rows.map((row) => ({ id: row.id, title: row.title, slug: row.slug || null, category: row.category || null }));
  }

  private async getNotices(): Promise<HomeNotice[]> {
    const rows = await this.noticeRepo.createQueryBuilder('notice').where('notice.deleted_at IS NULL').andWhere('notice.status = :status', { status: 'published' })
      .andWhere('notice.published_at IS NOT NULL AND notice.published_at <= NOW()').orderBy('notice.is_pinned', 'DESC').addOrderBy('notice.published_at', 'DESC').take(3).getMany();
    return rows.map((notice) => ({ id: notice.id, public_id: notice.public_id, title: notice.title, excerpt: notice.excerpt, published_at: notice.published_at?.toISOString() || null }));
  }

  private async getDeveloperEntries(type: 'issue' | 'pull_request'): Promise<HomeDeveloperEntry[]> {
    const rows = await this.developerFeedRepo.find({ where: { item_type: type, is_low_value: false, is_indexable: true }, order: { updated_at: 'DESC', id: 'DESC' }, take: 3 });
    return rows.map((row) => ({ id: row.id, external_id: row.external_id, title: row.summary || `#${row.external_id}`, state: row.state, url: row.source_url, repository: row.repository, updated_at: row.updated_at.toISOString() }));
  }

  private async getVersions(): Promise<Array<Record<string, string | number | null>>> {
    const versions = await this.versionRepo.find({ where: { is_latest: true }, order: { channel: 'ASC' }, take: 5, select: ['id', 'build', 'version_value', 'display_name', 'channel'] });
    return versions.map((version) => ({ id: version.id, version: version.build || version.version_value, display_name: version.display_name, channel: version.channel || null }));
  }
}

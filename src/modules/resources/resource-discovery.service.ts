import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceLike } from '@entities/resource-like.entity';
import { ResourceFavorite } from '@entities/resource-favorite.entity';
import { ResourceViewEvent } from '@entities/resource-view-event.entity';
import { DownloadEvent } from '@entities/download-event.entity';
import { toPublicResource } from './resource-public.dto';

type Signal = { views: number; downloads: number };
type RecommendationProfile = {
  kinds: Map<string, number>;
  categories: Map<number, number>;
  tags: Map<string, number>;
};

export type ResourceRecommendation = {
  resource: Record<string, any>;
  score: number;
  reasons: string[];
};

const HOME_WINDOW = 400;
const RELATED_WINDOW = 300;
const PERSONALIZED_WINDOW = 350;
const HOT_WINDOW = 300;

@Injectable()
export class ResourceDiscoveryService {
  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceLike) private readonly likes: Repository<ResourceLike>,
    @InjectRepository(ResourceFavorite) private readonly favorites: Repository<ResourceFavorite>,
    @InjectRepository(ResourceViewEvent) private readonly views: Repository<ResourceViewEvent>,
    @InjectRepository(DownloadEvent) private readonly downloads: Repository<DownloadEvent>,
  ) {}

  async home(kind?: string, requestedLimit = 8, requestedPage = 1) {
    const limit = this.limit(requestedLimit, 1, 20, 8);
    const page = this.page(requestedPage);
    const candidates = await this.visibleQuery('resource', kind)
      .orderBy('resource.updated_at', 'DESC').addOrderBy('resource.id', 'DESC').take(HOME_WINDOW).getMany();
    const recentSignals = await this.recentSignals(candidates.map((resource) => resource.id));

    const featured = [...candidates]
      .filter((resource) => Number(resource.is_featured) === 1)
      .sort((left, right) => this.popularity(right) - this.popularity(left) || left.id - right.id);
    const trending = [...candidates]
      .sort((left, right) => this.trendingScore(right) - this.trendingScore(left) || left.id - right.id);
    const rising = [...candidates]
      .sort((left, right) => this.risingScore(right, recentSignals.get(right.id)) - this.risingScore(left, recentSignals.get(left.id)) || left.id - right.id);
    const topRated = [...candidates]
      .filter((resource) => Number(resource.rating_count || 0) > 0)
      .sort((left, right) => this.bayesianRating(right) - this.bayesianRating(left) || left.id - right.id);
    const newest = [...candidates]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime() || left.id - right.id);

    const section = (items: Resource[], score: (resource: Resource) => number, reason: (resource: Resource) => string[], signal = false) => this.pageItems(
      items.map((resource) => ({
        resource: toPublicResource(resource, true),
        score: Number(score(resource).toFixed(3)),
        reasons: reason(resource),
        ...(signal ? {
          recent_views: recentSignals.get(resource.id)?.views || 0,
          recent_downloads: recentSignals.get(resource.id)?.downloads || 0,
        } : {}),
      })), page, limit, HOME_WINDOW, candidates.length >= HOME_WINDOW,
    );

    return {
      generated_at: new Date().toISOString(),
      sections: {
        featured: section(featured, (resource) => this.popularity(resource), () => ['editor_pick']),
        trending: section(trending, (resource) => this.trendingScore(resource), () => ['trending']),
        rising: section(rising, (resource) => this.risingScore(resource, recentSignals.get(resource.id)), (resource) => {
          const signals = recentSignals.get(resource.id);
          const reasons = [
            ...(signals?.views ? ['recent_views'] : []),
            ...(signals?.downloads ? ['recent_downloads'] : []),
          ];
          return reasons.length ? reasons : ['quality_signals'];
        }, true),
        top_rated: section(topRated, (resource) => this.bayesianRating(resource), () => ['top_rated']),
        newest: section(newest, (resource) => 1 / (1 + Math.max(0, (Date.now() - new Date(resource.created_at).getTime()) / 86_400_000)), () => ['newest']),
      },
    };
  }

  async hot(requestedLimit = 10, requestedPage = 1) {
    const limit = this.limit(requestedLimit, 1, 30, 10);
    const page = this.page(requestedPage);
    const candidates = await this.visibleQuery('resource')
      .orderBy('resource.download_count', 'DESC').addOrderBy('resource.id', 'DESC').take(HOT_WINDOW).getMany();
    return {
      algorithm: 'resource-download-count-v1',
      items: candidates.map((resource) => ({
        resource: toPublicResource(resource, true),
        score: Math.max(0, Number(resource.download_count) || 0),
        reasons: ['top_downloaded'],
      })).slice((page - 1) * limit, page * limit),
      pagination: {
        page, limit, items_in_window: candidates.length,
        more_in_window: page * limit < candidates.length,
        candidate_window_size: HOT_WINDOW,
        candidate_window_truncated: candidates.length >= HOT_WINDOW,
      },
    };
  }

  async related(publicId: string, requestedLimit = 8, requestedPage = 1): Promise<{ algorithm: string; items: ResourceRecommendation[]; pagination: Record<string, unknown> }> {
    const limit = this.limit(requestedLimit, 1, 24, 8);
    const page = this.page(requestedPage);
    const source = await this.visibleQuery('resource').andWhere('resource.public_id = :publicId', { publicId }).getOne();
    if (!source) throw new NotFoundException('Resource not found');

    const sourceTags = new Set(this.tags(source));
    const candidates = await this.visibleQuery('resource')
      .andWhere('resource.id != :sourceId', { sourceId: source.id })
      .orderBy('resource.updated_at', 'DESC').addOrderBy('resource.id', 'DESC').take(RELATED_WINDOW)
      .getMany();

    const ranked = candidates.map((candidate) => {
      let score = this.qualityScore(candidate);
      const reasons: string[] = [];
      if (candidate.resource_kind && candidate.resource_kind === source.resource_kind) {
        score += 34;
        reasons.push('same_kind');
      }
      if (candidate.category_id && candidate.category_id === source.category_id) {
        score += 20;
        reasons.push('same_category');
      }
      const overlap = this.tags(candidate).filter((tag) => sourceTags.has(tag));
      if (overlap.length) {
        score += Math.min(42, overlap.length * 14);
        reasons.push(`shared_tags:${overlap.slice(0, 3).join(',')}`);
      }
      if (Number(candidate.is_featured) === 1) {
        score += 3;
        reasons.push('featured');
      }
      return { resource: candidate, score, reasons };
    }).sort((left, right) => right.score - left.score || left.resource.id - right.resource.id);

    const rankedItems = ranked.map((item) => ({
      resource: toPublicResource(item.resource, true),
      score: Number(item.score.toFixed(3)),
      reasons: item.reasons.length ? item.reasons : ['popular_now'],
    }));
    const pageResult = this.pageItems(rankedItems, page, limit, RELATED_WINDOW, candidates.length >= RELATED_WINDOW);

    return {
      algorithm: 'resource-related-v1',
      ...pageResult,
    };
  }

  async forYou(userId?: number, kind?: string, requestedLimit = 12, requestedPage = 1) {
    const limit = this.limit(requestedLimit, 1, 30, 12);
    const page = this.page(requestedPage);
    if (!userId) return this.fallbackForYou(kind, limit, page);

    const [likes, favorites] = await Promise.all([
      this.likes.find({ where: { user_id: userId }, select: { resource_id: true } as any, order: { created_at: 'DESC' }, take: 120 }),
      this.favorites.find({ where: { user_id: userId }, select: { resource_id: true } as any, order: { created_at: 'DESC' }, take: 120 }),
    ]);
    const seedIds = [...new Set([...likes, ...favorites].map((entry) => entry.resource_id))];
    if (!seedIds.length) return this.fallbackForYou(kind, limit, page);

    const seeds = await this.visibleQuery('seed')
      .andWhere('seed.id IN (:...seedIds)', { seedIds })
      .take(240)
      .getMany();
    if (!seeds.length) return this.fallbackForYou(kind, limit, page);

    const profile = this.profile(seeds);
    const candidates = await this.visibleQuery('resource', kind)
      .orderBy('resource.updated_at', 'DESC').addOrderBy('resource.id', 'DESC').take(PERSONALIZED_WINDOW).getMany();
    const seedSet = new Set(seeds.map((seed) => seed.id));

    const ranked = candidates
      .filter((candidate) => !seedSet.has(candidate.id))
      .map((candidate) => this.scoreForProfile(candidate, profile))
      .sort((left, right) => right.score - left.score || left.resource.id - right.resource.id);

    return {
      algorithm: 'resource-taste-v1',
      personalized: true,
      privacy: 'Uses only your MDTBBS likes/favorites on currently public resources and public resource metadata.',
      ...this.pageItems(ranked.map((item) => ({
        resource: toPublicResource(item.resource, true),
        score: Number(item.score.toFixed(3)),
        reasons: item.reasons.length ? item.reasons : ['popular_now'],
      })), page, limit, PERSONALIZED_WINDOW, candidates.length >= PERSONALIZED_WINDOW),
    };
  }

  private async fallbackForYou(kind: string | undefined, limit: number, page = 1) {
    const window = Math.max(limit * 4, 60);
    const candidates = await this.visibleQuery('resource', kind)
      .orderBy('resource.updated_at', 'DESC').addOrderBy('resource.id', 'DESC').take(window).getMany();
    const ranked = candidates
      .sort((left, right) => this.trendingScore(right) - this.trendingScore(left) || left.id - right.id)
      .map((resource) => ({
        resource: toPublicResource(resource, true),
        score: Number(this.trendingScore(resource).toFixed(3)),
        reasons: ['trending'],
      }));
    return {
      algorithm: 'resource-trending-v1',
      personalized: false,
      privacy: 'No personal profile was used.',
      ...this.pageItems(ranked, page, limit, window, candidates.length >= window),
    };
  }

  private scoreForProfile(resource: Resource, profile: RecommendationProfile) {
    let score = this.qualityScore(resource);
    const reasons: string[] = [];
    const kindWeight = resource.resource_kind ? profile.kinds.get(resource.resource_kind) || 0 : 0;
    if (kindWeight) {
      score += Math.min(36, 18 + Math.log2(kindWeight + 1) * 8);
      reasons.push(`kind:${resource.resource_kind}`);
    }
    const categoryWeight = resource.category_id ? profile.categories.get(resource.category_id) || 0 : 0;
    if (categoryWeight) {
      score += Math.min(24, 12 + Math.log2(categoryWeight + 1) * 5);
      reasons.push('category');
    }
    const matchingTags = this.tags(resource)
      .map((tag) => [tag, profile.tags.get(tag) || 0] as const)
      .filter((entry) => entry[1] > 0)
      .sort((left, right) => right[1] - left[1]);
    if (matchingTags.length) {
      score += Math.min(44, matchingTags.reduce((sum, entry) => sum + 10 + Math.log2(entry[1] + 1) * 3, 0));
      reasons.push(`tags:${matchingTags.slice(0, 3).map((entry) => entry[0]).join(',')}`);
    }
    if (Number(resource.is_featured) === 1) score += 2;
    return { resource, score, reasons };
  }

  private profile(resources: Resource[]): RecommendationProfile {
    const profile: RecommendationProfile = { kinds: new Map(), categories: new Map(), tags: new Map() };
    for (const resource of resources) {
      if (resource.resource_kind) profile.kinds.set(resource.resource_kind, (profile.kinds.get(resource.resource_kind) || 0) + 1);
      if (resource.category_id) profile.categories.set(resource.category_id, (profile.categories.get(resource.category_id) || 0) + 1);
      for (const tag of this.tags(resource)) profile.tags.set(tag, (profile.tags.get(tag) || 0) + 1);
    }
    return profile;
  }

  private visibleQuery(alias: string, kind?: string): SelectQueryBuilder<Resource> {
    const query = this.resources.createQueryBuilder(alias)
      .leftJoinAndSelect(`${alias}.user`, `${alias}User`)
      .leftJoinAndSelect(`${alias}.category`, `${alias}Category`)
      .where(`${alias}.deleted_at IS NULL`)
      .andWhere(`${alias}.is_public = 1`)
      .andWhere(`${alias}.status IN (:...visibleStatuses)`, { visibleStatuses: ['approved', 'published'] })
      .andWhere(`(${alias}.visibility IS NULL OR ${alias}.visibility = 'public')`)
      .andWhere(`(${alias}Category.id IS NULL OR ${alias}Category.is_active = 1)`)
      .andWhere(`${alias}.public_id IS NOT NULL`);
    if (kind?.trim()) query.andWhere(`${alias}.resource_kind = :kind`, { kind: kind.trim() });
    return query;
  }

  private async recentSignals(resourceIds: number[]): Promise<Map<number, Signal>> {
    const result = new Map<number, Signal>();
    if (!resourceIds.length) return result;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [views, downloads] = await Promise.all([
      this.views.createQueryBuilder('event')
        .select('event.resource_id', 'resource_id')
        .addSelect('COUNT(*)', 'count')
        .where('event.resource_id IN (:...resourceIds)', { resourceIds })
        .andWhere('event.created_at >= :since', { since })
        .groupBy('event.resource_id')
        .getRawMany<{ resource_id: string; count: string }>(),
      this.downloads.createQueryBuilder('event')
        .select('event.resource_id', 'resource_id')
        .addSelect('COUNT(*)', 'count')
        .where('event.resource_id IN (:...resourceIds)', { resourceIds })
        .andWhere('event.created_at >= :since', { since })
        .andWhere("event.event_type = 'completed'")
        .groupBy('event.resource_id')
        .getRawMany<{ resource_id: string; count: string }>(),
    ]);
    for (const row of views) result.set(Number(row.resource_id), { views: Number(row.count) || 0, downloads: 0 });
    for (const row of downloads) {
      const id = Number(row.resource_id);
      const current = result.get(id) || { views: 0, downloads: 0 };
      current.downloads = Number(row.count) || 0;
      result.set(id, current);
    }
    return result;
  }

  private tags(resource: Resource): string[] {
    const raw = resource.metadata_json?.tags;
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 50);
  }

  private popularity(resource: Resource): number {
    const views = Number(resource.view_count || 0);
    const downloads = Number(resource.download_count || 0);
    const ratings = Number(resource.rating_count || 0);
    return Math.log1p(Math.max(0, views)) * 0.8 + Math.log1p(Math.max(0, downloads)) * 2.4 + Math.log1p(Math.max(0, ratings)) * 1.4;
  }

  private qualityScore(resource: Resource): number {
    return this.popularity(resource) + this.bayesianRating(resource) * 2 + (Number(resource.is_featured) === 1 ? 2 : 0);
  }

  private trendingScore(resource: Resource): number {
    const ageDays = Math.max(0, (Date.now() - new Date(resource.updated_at || resource.created_at).getTime()) / 86_400_000);
    return this.qualityScore(resource) + 8 / Math.sqrt(ageDays + 1);
  }

  private risingScore(resource: Resource, signal?: Signal): number {
    return this.qualityScore(resource) * 0.45 + Math.log1p(signal?.views || 0) * 3 + Math.log1p(signal?.downloads || 0) * 6;
  }

  private bayesianRating(resource: Resource): number {
    const count = Math.max(0, Number(resource.rating_count || 0));
    const average = Math.max(0, Math.min(5, Number(resource.rating_average || 0)));
    const priorCount = 5;
    const priorAverage = 3.5;
    return (count * average + priorCount * priorAverage) / (count + priorCount);
  }

  private page(value: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(1, Math.min(400, Math.trunc(numeric))) : 1;
  }

  private pageItems<T>(items: T[], page: number, limit: number, candidateWindowSize: number, candidateWindowTruncated: boolean) {
    const start = (page - 1) * limit;
    return {
      items: items.slice(start, start + limit),
      pagination: {
        page,
        limit,
        items_in_window: items.length,
        more_in_window: start + limit < items.length,
        candidate_window_size: candidateWindowSize,
        candidate_window_truncated: candidateWindowTruncated,
      },
    };
  }

  private limit(value: number, min: number, max: number, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.trunc(numeric))) : fallback;
  }
}

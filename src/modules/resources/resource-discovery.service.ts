import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
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

@Injectable()
export class ResourceDiscoveryService {
  constructor(
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
    @InjectRepository(ResourceLike) private readonly likes: Repository<ResourceLike>,
    @InjectRepository(ResourceFavorite) private readonly favorites: Repository<ResourceFavorite>,
    @InjectRepository(ResourceViewEvent) private readonly views: Repository<ResourceViewEvent>,
    @InjectRepository(DownloadEvent) private readonly downloads: Repository<DownloadEvent>,
  ) {}

  async home(kind?: string, requestedLimit = 8) {
    const limit = this.limit(requestedLimit, 4, 20, 8);
    const candidates = await this.visibleQuery('resource', kind).take(400).getMany();
    const recentSignals = await this.recentSignals(candidates.map((resource) => resource.id));

    const featured = [...candidates]
      .filter((resource) => Number(resource.is_featured) === 1)
      .sort((left, right) => this.popularity(right) - this.popularity(left))
      .slice(0, limit);
    const trending = [...candidates]
      .sort((left, right) => this.trendingScore(right) - this.trendingScore(left))
      .slice(0, limit);
    const rising = [...candidates]
      .sort((left, right) => this.risingScore(right, recentSignals.get(right.id)) - this.risingScore(left, recentSignals.get(left.id)))
      .slice(0, limit);
    const topRated = [...candidates]
      .filter((resource) => Number(resource.rating_count || 0) > 0)
      .sort((left, right) => this.bayesianRating(right) - this.bayesianRating(left))
      .slice(0, limit);
    const newest = [...candidates]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .slice(0, limit);

    return {
      generated_at: new Date().toISOString(),
      sections: {
        featured: featured.map((resource) => toPublicResource(resource, true)),
        trending: trending.map((resource) => toPublicResource(resource, true)),
        rising: rising.map((resource) => ({
          ...toPublicResource(resource, true),
          recent_views: recentSignals.get(resource.id)?.views || 0,
          recent_downloads: recentSignals.get(resource.id)?.downloads || 0,
        })),
        top_rated: topRated.map((resource) => toPublicResource(resource, true)),
        newest: newest.map((resource) => toPublicResource(resource, true)),
      },
    };
  }

  async related(publicId: string, requestedLimit = 8): Promise<{ algorithm: string; items: ResourceRecommendation[] }> {
    const limit = this.limit(requestedLimit, 1, 24, 8);
    const source = await this.visibleQuery('resource').andWhere('resource.public_id = :publicId', { publicId }).getOne();
    if (!source) throw new NotFoundException('Resource not found');

    const sourceTags = new Set(this.tags(source));
    const candidates = await this.visibleQuery('resource')
      .andWhere('resource.id != :sourceId', { sourceId: source.id })
      .take(300)
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
    }).sort((left, right) => right.score - left.score).slice(0, limit);

    return {
      algorithm: 'resource-related-v1',
      items: ranked.map((item) => ({
        resource: toPublicResource(item.resource, true),
        score: Number(item.score.toFixed(3)),
        reasons: item.reasons.length ? item.reasons : ['popular_now'],
      })),
    };
  }

  async forYou(userId?: number, kind?: string, requestedLimit = 12) {
    const limit = this.limit(requestedLimit, 1, 30, 12);
    if (!userId) return this.fallbackForYou(kind, limit);

    const [likes, favorites] = await Promise.all([
      this.likes.find({ where: { user_id: userId }, select: { resource_id: true } as any, order: { created_at: 'DESC' }, take: 120 }),
      this.favorites.find({ where: { user_id: userId }, select: { resource_id: true } as any, order: { created_at: 'DESC' }, take: 120 }),
    ]);
    const seedIds = [...new Set([...likes, ...favorites].map((entry) => entry.resource_id))];
    if (!seedIds.length) return this.fallbackForYou(kind, limit);

    const seeds = await this.resources.find({ where: { id: In(seedIds) } });
    const profile = this.profile(seeds);
    const candidates = await this.visibleQuery('resource', kind).take(350).getMany();
    const seedSet = new Set(seedIds);

    const ranked = candidates
      .filter((candidate) => !seedSet.has(candidate.id))
      .map((candidate) => this.scoreForProfile(candidate, profile))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);

    return {
      algorithm: 'resource-taste-v1',
      personalized: true,
      privacy: 'Uses only your MDTBBS resource likes/favorites and public resource metadata.',
      items: ranked.map((item) => ({
        resource: toPublicResource(item.resource, true),
        score: Number(item.score.toFixed(3)),
        reasons: item.reasons.length ? item.reasons : ['popular_now'],
      })),
    };
  }

  private async fallbackForYou(kind: string | undefined, limit: number) {
    const candidates = await this.visibleQuery('resource', kind).take(Math.max(limit * 4, 60)).getMany();
    return {
      algorithm: 'resource-trending-v1',
      personalized: false,
      privacy: 'No personal profile was used.',
      items: candidates
        .sort((left, right) => this.trendingScore(right) - this.trendingScore(left))
        .slice(0, limit)
        .map((resource) => ({
          resource: toPublicResource(resource, true),
          score: Number(this.trendingScore(resource).toFixed(3)),
          reasons: ['trending'],
        })),
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
      .where(`${alias}.deleted_at IS NULL`)
      .andWhere(`${alias}.is_public = 1`)
      .andWhere(`${alias}.status IN (:...visibleStatuses)`, { visibleStatuses: ['approved', 'published'] })
      .andWhere(`(${alias}.visibility IS NULL OR ${alias}.visibility = 'public')`)
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

  private limit(value: number, min: number, max: number, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.trunc(numeric))) : fallback;
  }
}

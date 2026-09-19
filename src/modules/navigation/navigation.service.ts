import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '@entities/category.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { Tag } from '@entities/tag.entity';
import { Setting } from '@entities/setting.entity';
import { RedisService } from '@database/redis.service';
import { RevalidationService } from '@common/services/revalidation.service';

const NAVIGATION_CACHE_KEY = 'cache:navigation:v1';
const NAVIGATION_CACHE_TTL_SECONDS = 60 * 60;
const FEATURED_TAG_LIMIT = 12;

export type NavigationLink = {
  label: string;
  href: string;
  description?: string;
};

export type NavigationSnapshot = {
  forumCategories: Array<{
    id: number;
    name: string;
    slug: string;
    sort_order: number;
    is_active: boolean;
    description: string | null;
    color: string | null;
    icon: string | null;
    group_key: string | null;
    parent_id: number | null;
    show_in_sidebar: boolean;
    post_count: number;
  }>;
  resourceTypes: Array<{
    id: number;
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
    sort_order: number;
    is_active: boolean;
  }>;
  featuredTags: Array<{
    id: number;
    name: string;
    slug: string;
    post_count: number;
  }>;
  links: NavigationLink[];
};

/**
 * The sole public navigation read model. It deliberately owns the joins and
 * caching policy so layouts never stitch together category, tag and settings
 * requests on their own.
 */
@Injectable()
export class NavigationService {
  private readonly logger = new Logger(NavigationService.name);

  constructor(
    @InjectRepository(Category) private readonly categoryRepository: Repository<Category>,
    @InjectRepository(ResourceCategory) private readonly resourceCategoryRepository: Repository<ResourceCategory>,
    @InjectRepository(Tag) private readonly tagRepository: Repository<Tag>,
    @InjectRepository(Setting) private readonly settingRepository: Repository<Setting>,
    private readonly redisService: RedisService,
    private readonly revalidationService: RevalidationService,
  ) {}

  async getPublicSnapshot(): Promise<NavigationSnapshot> {
    const cached = await this.redisService.get(NAVIGATION_CACHE_KEY);
    if (cached) {
      try {
        return this.parseSnapshot(cached);
      } catch {
        // A malformed cache entry must never poison public navigation. Rebuild it.
        await this.redisService.del(NAVIGATION_CACHE_KEY);
      }
    }

    const snapshot = await this.buildPublicSnapshot();
    await this.redisService.set(NAVIGATION_CACHE_KEY, JSON.stringify(snapshot), NAVIGATION_CACHE_TTL_SECONDS);
    return snapshot;
  }

  /**
   * Called by every mutation that can alter a public navigation item. Redis
   * and Next's data cache are separate layers, so both must be invalidated.
   */
  async invalidate(): Promise<void> {
    try {
      await this.redisService.del(NAVIGATION_CACHE_KEY);
    } catch (error) {
      this.logger.warn(`Failed to clear navigation cache: ${(error as Error).message}`);
    }

    await this.revalidationService.triggerRevalidation('/', 'navigation');
  }

  private async buildPublicSnapshot(): Promise<NavigationSnapshot> {
    const [forumRows, resourceTypes, tagRows, linkSetting] = await Promise.all([
      this.categoryRepository
        .createQueryBuilder('category')
        .leftJoin('category.posts', 'post')
        .addSelect('COUNT(post.id)', 'post_count')
        .where('category.is_active = :isActive', { isActive: 1 })
        .andWhere('category.show_in_sidebar = :showInSidebar', { showInSidebar: 1 })
        .groupBy('category.id')
        .orderBy('category.sort_order', 'ASC')
        .addOrderBy('category.created_at', 'ASC')
        .getRawMany(),
      this.resourceCategoryRepository.find({
        where: { is_active: 1 },
        order: { sort_order: 'ASC', id: 'ASC' },
      }),
      this.tagRepository
        .createQueryBuilder('tag')
        .leftJoin('tag.postTags', 'post_tag')
        .addSelect('COUNT(post_tag.post_id)', 'post_count')
        .groupBy('tag.id')
        .orderBy('post_count', 'DESC')
        .addOrderBy('tag.created_at', 'DESC')
        .take(FEATURED_TAG_LIMIT)
        .getRawMany(),
      this.settingRepository.findOne({ where: { key: 'footer_friendly_links' } }),
    ]);

    return {
      forumCategories: forumRows.map((row) => ({
        id: Number(row.category_id),
        name: row.category_name,
        slug: row.category_slug,
        sort_order: Number(row.category_sort_order),
        is_active: Boolean(row.category_is_active),
        description: row.category_description ?? null,
        color: row.category_color ?? null,
        icon: row.category_icon ?? null,
        group_key: row.category_group_key ?? null,
        parent_id: row.category_parent_id === null ? null : Number(row.category_parent_id),
        show_in_sidebar: Boolean(row.category_show_in_sidebar),
        post_count: Number(row.post_count) || 0,
      })),
      resourceTypes: resourceTypes.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description ?? null,
        icon: category.icon ?? null,
        sort_order: category.sort_order,
        is_active: Boolean(category.is_active),
      })),
      featuredTags: tagRows.map((row) => ({
        id: Number(row.tag_id),
        name: row.tag_name,
        slug: row.tag_slug,
        post_count: Number(row.post_count) || 0,
      })),
      links: this.parseLinks(linkSetting?.value),
    };
  }

  private parseSnapshot(value: string): NavigationSnapshot {
    const parsed = JSON.parse(value) as Partial<NavigationSnapshot>;
    if (!Array.isArray(parsed.forumCategories) || !Array.isArray(parsed.resourceTypes)
      || !Array.isArray(parsed.featuredTags) || !Array.isArray(parsed.links)) {
      throw new Error('invalid navigation snapshot');
    }
    return parsed as NavigationSnapshot;
  }

  private parseLinks(raw: string | undefined): NavigationLink[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((item): NavigationLink[] => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        const label = typeof record.label === 'string' ? record.label.trim() : '';
        const href = typeof record.href === 'string' ? record.href.trim() : '';
        const description = typeof record.description === 'string' ? record.description.trim() : '';
        if (!label || !this.isSafeHref(href)) return [];
        return [{ label, href, ...(description ? { description } : {}) }];
      });
    } catch {
      return [];
    }
  }

  private isSafeHref(value: string): boolean {
    return /^\/(?!\/)/.test(value) || /^https?:\/\//i.test(value);
  }
}

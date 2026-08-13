import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ResourceCategory } from '@entities/resource-category.entity';
import { RedisService } from '@database/redis.service';
import { RevalidationService } from '@common/services/revalidation.service';

const RESOURCE_CATEGORY_ICON_WHITELIST = new Set([
  'Folder',
  'Puzzle',
  'Map',
  'Server',
  'Palette',
  'BookOpen',
  'Wrench',
  'FileText',
]);

@Injectable()
export class ResourceCategoryService {
  constructor(
    @InjectRepository(ResourceCategory)
    private categoryRepository: Repository<ResourceCategory>,
    private dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly revalidationService: RevalidationService,
  ) {}

  /**
   * Clear both the Redis category cache and the Next.js ISR cache for
   * resource pages. Called after every create/update/delete so public views
   * never serve stale category data.
   *
   * Errors here are swallowed — the underlying mutation has already
   * succeeded, and a stale cache is strictly preferable to a failed write.
   */
  private async invalidateCategoryCache(): Promise<void> {
    try {
      const keys = await this.redisService.keys('cache:resources:categories:*');
      if (keys.length > 0) {
        await Promise.all(keys.map((key) => this.redisService.del(key)));
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ResourceCategoryService] Failed to clear Redis category cache: ${(error as Error).message}`,
      );
    }

    try {
      await this.revalidationService.triggerRevalidation('/resources');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ResourceCategoryService] Failed to trigger Next.js revalidation: ${(error as Error).message}`,
      );
    }
  }

  /**
   * List all categories
   */
  async list(includeInactive: boolean = false): Promise<ResourceCategory[]> {
    const where: any = {};
    if (!includeInactive) {
      where.is_active = 1;
    }

    return this.categoryRepository.find({
      where,
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  /**
   * Public categories query: returns only enabled categories, ordered by
   * sort_order ASC with id ASC as a stable tiebreaker.
   *
   * Uses createQueryBuilder so the visibility constraint is expressed as an
   * explicit SQL clause rather than a TypeORM `where` object — harder to
   * accidentally broaden, and mirrors the pattern other public-scope queries
   * use when the filter must be obvious at a glance.
   */
  async getPublicCategories(): Promise<ResourceCategory[]> {
    return this.categoryRepository
      .createQueryBuilder('category')
      .where('category.is_active = :isActive', { isActive: 1 })
      .orderBy('category.sort_order', 'ASC')
      .addOrderBy('category.id', 'ASC')
      .getMany();
  }

  /**
   * Compatibility alias for clients that still call the old tree endpoint.
   * The category model is flat; ordering is stable in the shared query.
   */
  async getCategoriesTree(): Promise<ResourceCategory[]> {
    return this.getPublicCategories();
  }

  /**
   * Admin categories query: returns every category (including disabled) for
   * management UIs. Ordered by sort_order ASC with id ASC tiebreaker.
   */
  async getAllCategories(): Promise<ResourceCategory[]> {
    return this.categoryRepository.find({
      order: {
        sort_order: 'ASC',
        id: 'ASC',
      },
    });
  }

  async initializeDefaultCategories(): Promise<void> {
    const defaults: Array<Partial<ResourceCategory>> = [
      { name: '插件', slug: 'plugin', description: 'Mindustry 插件/模组', icon: 'Puzzle', sort_order: 1, is_active: 1 },
      { name: '地图', slug: 'map', description: '游戏地图文件', icon: 'Map', sort_order: 2, is_active: 1 },
      { name: '服务端', slug: 'server', description: '服务端配置/工具', icon: 'Server', sort_order: 3, is_active: 1 },
      { name: '材质包', slug: 'texture', description: '游戏材质/皮肤', icon: 'Palette', sort_order: 4, is_active: 1 },
      { name: '教程', slug: 'tutorial', description: '游戏/搭建教程', icon: 'BookOpen', sort_order: 5, is_active: 1 },
      { name: '工具', slug: 'tool', description: '辅助工具', icon: 'Wrench', sort_order: 6, is_active: 1 },
      { name: '其他', slug: 'other', description: '其他资源', icon: 'FileText', sort_order: 7, is_active: 1 },
    ];

    for (const category of defaults) {
      const existing = await this.categoryRepository.findOne({
        where: { slug: category.slug },
      });
      if (!existing) {
        await this.categoryRepository.save(this.categoryRepository.create(category));
      }
    }
  }

  /**
   * Get category by ID
   */
  async getById(id: number): Promise<ResourceCategory | null> {
    const category = await this.categoryRepository.findOne({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('分类不存在');
    }

    return category;
  }

  /**
   * Create a new category
   */
  async create(dto: Partial<ResourceCategory>): Promise<ResourceCategory> {
    this.validateIcon(dto.icon);
    // Check slug uniqueness
    const existing = await this.categoryRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new BadRequestException('Slug已存在');
    }

    // Set default sort_order to max + 1 if not provided
    if (dto.sort_order === undefined || dto.sort_order === null) {
      const maxSortOrder = await this.categoryRepository
        .createQueryBuilder('category')
        .select('MAX(category.sort_order)', 'max')
        .getRawOne();

      dto.sort_order = (maxSortOrder?.max || 0) + 1;
    }

    const category = this.categoryRepository.create({
      ...dto,
      is_active: dto.is_active === undefined ? 1 : dto.is_active,
      icon: dto.icon || 'Folder',
    });
    const saved = await this.categoryRepository.save(category);

    await this.invalidateCategoryCache();
    return saved;
  }

  /**
   * Update category
   */
  async update(id: number, dto: Partial<ResourceCategory>): Promise<ResourceCategory | null> {
    const category = await this.getById(id);
    if (!category) return null;

    this.validateIcon(dto.icon);

    // Check slug uniqueness if changing
    if (dto.slug && dto.slug !== category.slug) {
      const existing = await this.categoryRepository.findOne({
        where: { slug: dto.slug },
      });
      if (existing) {
        throw new BadRequestException('Slug已存在');
      }
    }

    await this.categoryRepository.update(id, dto);
    const updated = await this.categoryRepository.findOne({ where: { id } });

    await this.invalidateCategoryCache();
    return updated;
  }

  private validateIcon(icon: string | null | undefined): void {
    if (icon !== undefined && icon !== null && !RESOURCE_CATEGORY_ICON_WHITELIST.has(icon)) {
      throw new BadRequestException('Invalid resource category icon');
    }
  }

  /**
   * Delete category (fails if has resources)
   */
  async delete(id: number): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('分类不存在');
    }

    // Check if category has resources
    const resourceCount = await this.categoryRepository.manager.count('resources', {
      where: { category_id: id },
    });

    if (resourceCount > 0) {
      throw new BadRequestException('该分类下还有资源，无法删除');
    }

    await this.categoryRepository.delete(id);
    await this.invalidateCategoryCache();
  }
}

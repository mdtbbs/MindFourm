import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ResourceCategory } from '@entities/resource-category.entity';

@Injectable()
export class ResourceCategoryService {
  constructor(
    @InjectRepository(ResourceCategory)
    private categoryRepository: Repository<ResourceCategory>,
    private dataSource: DataSource,
  ) {}

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
      order: { sort_order: 'ASC' },
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
    // Check slug uniqueness
    const existing = await this.categoryRepository.findOne({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new BadRequestException('Slug已存在');
    }

    const category = this.categoryRepository.create(dto);
    return this.categoryRepository.save(category);
  }

  /**
   * Update category
   */
  async update(id: number, dto: Partial<ResourceCategory>): Promise<ResourceCategory | null> {
    const category = await this.getById(id);
    if (!category) return null;

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
    return this.categoryRepository.findOne({ where: { id } });
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
  }
}

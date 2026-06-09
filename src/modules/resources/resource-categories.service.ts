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

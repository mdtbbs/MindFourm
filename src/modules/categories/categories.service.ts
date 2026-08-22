import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '@entities/category.entity';
import { Post } from '@entities/post.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
  ) {}

  async getAll(includeInactive = false) {
    const builder = this.categoryRepository
      .createQueryBuilder('category')
      .leftJoin('category.posts', 'post')
      .addSelect('COUNT(post.id)', 'post_count')
      .groupBy('category.id')
      .orderBy('category.sort_order', 'ASC')
      .addOrderBy('category.created_at', 'ASC');

    if (!includeInactive) {
      builder.where('category.is_active = :isActive', { isActive: 1 });
    }

    const categories = await builder.getRawMany();

    return categories.map((row) => ({
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
      sort_order: row.category_sort_order,
      is_active: Boolean(row.category_is_active),
      description: row.category_description,
      color: row.category_color,
      icon: row.category_icon,
      group_key: row.category_group_key,
      parent_id: row.category_parent_id,
      show_in_sidebar: Boolean(row.category_show_in_sidebar),
      created_at: row.category_created_at,
      post_count: parseInt(row.post_count, 10),
    }));
  }

  async getById(id: number) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    const post_count = await this.postRepository.count({ where: { category_id: id } });
    return { ...category, post_count };
  }

  async getBySlug(slug: string) {
    const category = await this.categoryRepository.findOne({ where: { slug } });
    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" not found`);
    }
    return category;
  }

  async create(dto: CreateCategoryDto) {
    if (dto.parent_id) {
      await this.assertValidParent(dto.parent_id);
    }
    const category = this.categoryRepository.create({
      name: dto.name,
      slug: dto.slug,
      description: dto.description ?? null,
      color: dto.color ?? null,
      icon: dto.icon ?? null,
      group_key: dto.group_key ?? null,
      parent_id: dto.parent_id ?? null,
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active === false ? 0 : 1,
      show_in_sidebar: dto.show_in_sidebar === false ? 0 : 1,
    });
    return this.categoryRepository.save(category);
  }

  async update(id: number, dto: UpdateCategoryDto) {
    const category = await this.getById(id);
    if (dto.name !== undefined) category.name = dto.name;
    if (dto.slug !== undefined) category.slug = dto.slug;
    if (dto.description !== undefined) category.description = dto.description;
    if (dto.color !== undefined) category.color = dto.color;
    if (dto.icon !== undefined) category.icon = dto.icon;
    if (dto.group_key !== undefined) category.group_key = dto.group_key;
    if (dto.parent_id !== undefined) {
      if (dto.parent_id) await this.assertValidParent(dto.parent_id, id);
      category.parent_id = dto.parent_id;
    }
    if (dto.sort_order !== undefined) category.sort_order = dto.sort_order;
    if (dto.is_active !== undefined) category.is_active = dto.is_active ? 1 : 0;
    if (dto.show_in_sidebar !== undefined) category.show_in_sidebar = dto.show_in_sidebar ? 1 : 0;
    return this.categoryRepository.save(category);
  }

  private async assertValidParent(parentId: number, categoryId?: number): Promise<void> {
    let parent = await this.categoryRepository.findOne({ where: { id: parentId } });
    if (!parent) {
      throw new NotFoundException('上级板块不存在');
    }

    const visited = new Set<number>();
    while (parent) {
      if (parent.id === categoryId) {
        throw new BadRequestException('板块层级不能形成循环');
      }
      if (visited.has(parent.id) || !parent.parent_id) break;
      visited.add(parent.id);
      parent = await this.categoryRepository.findOne({ where: { id: parent.parent_id } });
    }
  }

  async delete(id: number) {
    const category = await this.getById(id);
    await this.categoryRepository.remove(category);
    return { message: 'Category deleted successfully' };
  }
}

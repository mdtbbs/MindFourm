import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '@entities/category.entity';
import { Post } from '@entities/post.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
  ) {}

  async getAll() {
    const categories = await this.categoryRepository
      .createQueryBuilder('category')
      .leftJoin('category.posts', 'post')
      .addSelect('COUNT(post.id)', 'post_count')
      .groupBy('category.id')
      .orderBy('category.sort_order', 'ASC')
      .addOrderBy('category.created_at', 'ASC')
      .getRawMany();

    return categories.map((row) => ({
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
      sort_order: row.category_sort_order,
      is_active: row.category_is_active,
      created_at: row.category_created_at,
      post_count: parseInt(row.post_count, 10),
    }));
  }

  async getById(id: number) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  async getBySlug(slug: string) {
    const category = await this.categoryRepository.findOne({ where: { slug } });
    if (!category) {
      throw new NotFoundException(`Category with slug "${slug}" not found`);
    }
    return category;
  }

  async create(dto: { name: string; slug: string; sort_order?: number }) {
    const category = this.categoryRepository.create({
      name: dto.name,
      slug: dto.slug,
      sort_order: dto.sort_order ?? 0,
      is_active: 1,
    });
    return this.categoryRepository.save(category);
  }

  async update(id: number, dto: { name?: string; slug?: string; sort_order?: number; is_active?: number }) {
    const category = await this.getById(id);
    if (dto.name !== undefined) category.name = dto.name;
    if (dto.slug !== undefined) category.slug = dto.slug;
    if (dto.sort_order !== undefined) category.sort_order = dto.sort_order;
    if (dto.is_active !== undefined) category.is_active = dto.is_active;
    return this.categoryRepository.save(category);
  }

  async delete(id: number) {
    const category = await this.getById(id);
    await this.categoryRepository.remove(category);
    return { message: 'Category deleted successfully' };
  }
}

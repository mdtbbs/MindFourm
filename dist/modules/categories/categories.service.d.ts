import { Repository } from 'typeorm';
import { Category } from '@entities/category.entity';
import { Post } from '@entities/post.entity';
export declare class CategoriesService {
    private readonly categoryRepository;
    private readonly postRepository;
    constructor(categoryRepository: Repository<Category>, postRepository: Repository<Post>);
    getAll(): Promise<{
        id: any;
        name: any;
        slug: any;
        sort_order: any;
        is_active: any;
        created_at: any;
        post_count: number;
    }[]>;
    getById(id: number): Promise<Category>;
    getBySlug(slug: string): Promise<Category>;
    create(dto: {
        name: string;
        slug: string;
        sort_order?: number;
    }): Promise<Category>;
    update(id: number, dto: {
        name?: string;
        slug?: string;
        sort_order?: number;
        is_active?: number;
    }): Promise<Category>;
    delete(id: number): Promise<{
        message: string;
    }>;
}

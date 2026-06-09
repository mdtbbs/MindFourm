import { Repository } from 'typeorm';
import { Tag } from '../../entities/tag.entity';
import { Post } from '../../entities/post.entity';
import { PostTag } from '../../entities/post-tag.entity';
export declare class TagsService {
    private readonly tagRepository;
    private readonly postRepository;
    private readonly postTagRepository;
    constructor(tagRepository: Repository<Tag>, postRepository: Repository<Post>, postTagRepository: Repository<PostTag>);
    getAll(): Promise<{
        id: any;
        name: any;
        slug: any;
        created_at: any;
        post_count: number;
    }[]>;
    getBySlug(slug: string): Promise<Tag>;
    getOrCreate(name: string): Promise<Tag>;
    attachTags(postId: number, tagNames: string[]): Promise<Tag[]>;
    batchAttach(postId: number, tagIds: number[]): Promise<void>;
    detachTags(postId: number): Promise<void>;
    getPostTags(postId: number): Promise<Tag[]>;
    getPostTagsForMultiplePosts(postIds: number[]): Promise<Record<number, Tag[]>>;
    getPostsByTagSlug(slug: string, page: number, limit: number): Promise<{
        posts: Post[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    findAll(page?: number, limit?: number): Promise<{
        data: Tag[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    create(dto: {
        name: string;
        slug?: string;
    }): Promise<Tag>;
    update(id: number, dto: {
        name?: string;
        slug?: string;
    }): Promise<Tag>;
    delete(id: number): Promise<{
        message: string;
    }>;
}

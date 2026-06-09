import { Post } from './post.entity';
export declare class Category {
    id: number;
    name: string;
    slug: string;
    sort_order: number;
    is_active: number;
    created_at: Date;
    posts: Post[];
}

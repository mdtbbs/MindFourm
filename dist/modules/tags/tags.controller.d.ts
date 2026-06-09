import { TagsService } from './tags.service';
export declare class TagsController {
    private readonly tagsService;
    constructor(tagsService: TagsService);
    getAll(): Promise<{
        id: any;
        name: any;
        slug: any;
        created_at: any;
        post_count: number;
    }[]>;
    getPostsByTagSlug(slug: string, page?: number, limit?: number): Promise<{
        posts: import("../../entities").Post[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
}

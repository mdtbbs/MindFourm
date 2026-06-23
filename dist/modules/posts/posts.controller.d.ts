import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostsDto } from './dto/query-posts.dto';
import { LogsService } from '../logs/logs.service';
export declare class PostsController {
    private readonly postsService;
    private readonly logsService;
    constructor(postsService: PostsService, logsService: LogsService);
    findAll(query: QueryPostsDto): Promise<{
        data: import("../../entities").Post[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    findAllCursor(query: QueryPostsDto): Promise<{
        data: import("../../entities").Post[];
        nextCursor: string | null;
        hasMore: boolean;
    }>;
    getTrending(limit?: number): Promise<import("../../entities").Post[]>;
    getPinned(categoryId?: number): Promise<import("../../entities").Post[]>;
    search(query: string, limit?: number): Promise<import("../../entities").Post[]>;
    findOne(id: number, replyPage?: number, replyLimit?: number): Promise<{
        replies: import("../../entities").Reply[];
        replyPagination: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
        id: number;
        user_id: number;
        category_id: number;
        server_id: number;
        required_group_id: number;
        post_type: string;
        title: string;
        content: string;
        content_html: string;
        status: string;
        is_pinned: number;
        view_count: number;
        like_count: number;
        created_at: Date;
        updated_at: Date;
        deleted_at: Date;
        user: import("../../entities").User;
        category: import("../../entities").Category;
        requiredGroup: import("../../entities").Group;
        bookmarks: import("../../entities").Bookmark[];
        attachments: import("../../entities").Attachment[];
        notifications: import("../../entities").Notification[];
        likes: import("../../entities").PostLike[];
        postTags: import("../../entities").PostTag[];
    }>;
    create(dto: CreatePostDto, req: any): Promise<import("../../entities").Post | null>;
    update(id: number, dto: UpdatePostDto, req: any): Promise<import("../../entities").Post | null>;
    delete(id: number, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    pin(id: number, isPinned: number, req: any): Promise<import("../../entities").Post>;
    move(id: number, categoryId: number, req: any): Promise<import("../../entities").Post>;
    findByUser(userId: number, page?: number, limit?: number): Promise<{
        data: import("../../entities").Post[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    private logOperation;
    private getClientIp;
}

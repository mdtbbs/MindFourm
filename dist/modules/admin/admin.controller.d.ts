import { AdminService } from './admin.service';
import { StatsService } from '../stats/stats.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { BansService } from '../bans/bans.service';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import { BulkPostsDto } from './dto/bulk-posts.dto';
import { MergeTagsDto } from './dto/merge-tags.dto';
export declare class AdminController {
    private readonly adminService;
    private readonly statsService;
    private readonly settingsService;
    private readonly logsService;
    private readonly bansService;
    private readonly categoriesService;
    private readonly tagsService;
    constructor(adminService: AdminService, statsService: StatsService, settingsService: SettingsService, logsService: LogsService, bansService: BansService, categoriesService: CategoriesService, tagsService: TagsService);
    getStats(): Promise<{
        total_posts: number;
        total_replies: number;
        total_users: number;
        posts_today: number;
        replies_today: number;
        active_24h: number;
    }>;
    getBadgeCounts(): Promise<{
        pending_posts: number;
        pending_replies: number;
        pending_avatars: number;
        show_announce: boolean;
    }>;
    getAllSettings(): Promise<Record<string, string>>;
    getCategorySettings(category: string): Promise<Record<string, string>>;
    updateSettings(category: string, settings: Record<string, string>): Promise<{
        message: string;
    }>;
    getUsers(page?: number, limit?: number, search?: string): Promise<{
        data: never[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    updateUserRole(id: number, body: {
        role: string;
    }): Promise<{
        message: string;
    }>;
    getPosts(page?: number, limit?: number, status?: string, category_id?: number): Promise<{
        data: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    bulkDeletePosts(dto: BulkPostsDto): Promise<{
        message: string;
    }>;
    bulkPinPosts(dto: BulkPostsDto): Promise<{
        message: string;
    }>;
    bulkMovePosts(dto: BulkPostsDto): Promise<{
        message: string;
    }>;
    pinPost(id: number, body: {
        is_pinned: number;
    }): Promise<import("../../entities").Post>;
    movePost(id: number, body: {
        category_id: number;
    }): Promise<import("../../entities").Post>;
    createCategory(dto: any): Promise<import("../../entities").Category>;
    updateCategory(id: number, dto: any): Promise<import("../../entities").Category>;
    deleteCategory(id: number): Promise<{
        message: string;
    }>;
    getTags(page?: number, limit?: number): Promise<{
        data: import("../../entities").Tag[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    createTag(dto: any): Promise<import("../../entities").Tag>;
    updateTag(id: number, dto: any): Promise<import("../../entities").Tag>;
    deleteTag(id: number): Promise<{
        message: string;
    }>;
    mergeTags(dto: MergeTagsDto): Promise<{
        message: string;
    }>;
    getModerationQueue(page?: number, limit?: number, type?: string): Promise<{
        data: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    approveItem(id: number, type: string | undefined, req: any): Promise<{
        message: string;
    }>;
    rejectItem(id: number, type: string | undefined, req: any): Promise<{
        message: string;
    }>;
    getBans(page?: number, limit?: number, ban_type?: string, is_active?: number): Promise<{
        data: import("../../entities").Ban[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    createBan(dto: {
        ban_type: string;
        value: string;
        reason?: string;
    }, user_id: number): Promise<import("../../entities").Ban>;
    updateBan(id: number, updates: {
        reason?: string;
        is_active?: number;
    }): Promise<import("../../entities").Ban>;
    deactivateBan(id: number): Promise<{
        message: string;
    }>;
    cleanupSessions(): Promise<{
        message: string;
    }>;
    cleanupLogs(req: any): Promise<{
        message: string;
    }>;
    cleanupSoftDeleted(): Promise<{
        message: string;
    }>;
    getLogs(page?: number, limit?: number, user_id?: number, action?: string, target_type?: string): Promise<{
        data: import("../../entities").OperationLog[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    private logOperation;
    private getClientIp;
}

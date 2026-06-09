import { Repository, DataSource } from 'typeorm';
import { Post, User, Category, Tag, PostTag, Ban, Setting, OperationLog, Reply } from '@entities/index';
import { StatsService } from '../stats/stats.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { BansService } from '../bans/bans.service';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
export declare class AdminService {
    private postRepository;
    private replyRepository;
    private userRepository;
    private categoryRepository;
    private tagRepository;
    private postTagRepository;
    private banRepository;
    private settingRepository;
    private operationLogRepository;
    private dataSource;
    private statsService;
    private settingsService;
    private logsService;
    private bansService;
    private categoriesService;
    private tagsService;
    constructor(postRepository: Repository<Post>, replyRepository: Repository<Reply>, userRepository: Repository<User>, categoryRepository: Repository<Category>, tagRepository: Repository<Tag>, postTagRepository: Repository<PostTag>, banRepository: Repository<Ban>, settingRepository: Repository<Setting>, operationLogRepository: Repository<OperationLog>, dataSource: DataSource, statsService: StatsService, settingsService: SettingsService, logsService: LogsService, bansService: BansService, categoriesService: CategoriesService, tagsService: TagsService);
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
        show_announce: boolean;
    }>;
    getPosts(query: {
        page: number;
        limit: number;
        status?: string;
        category_id?: number;
    }): Promise<{
        data: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    bulkDeletePosts(postIds: number[]): Promise<void>;
    bulkPinPosts(postIds: number[], isPinned: number): Promise<void>;
    bulkMovePosts(postIds: number[], categoryId: number): Promise<void>;
    pinPost(id: number, isPinned: number): Promise<Post>;
    movePost(id: number, categoryId: number): Promise<Post>;
    getModerationQueue(type: string, page: number, limit: number): Promise<{
        data: any[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    approvePost(id: number): Promise<void>;
    rejectPost(id: number): Promise<void>;
    mergeTags(fromId: number, toId: number): Promise<void>;
    cleanupLogs(): Promise<number>;
    cleanupSoftDeleted(): Promise<number>;
}

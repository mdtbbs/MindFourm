"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const index_1 = require("../../entities/index");
const stats_service_1 = require("../stats/stats.service");
const settings_service_1 = require("../settings/settings.service");
const logs_service_1 = require("../logs/logs.service");
const bans_service_1 = require("../bans/bans.service");
const categories_service_1 = require("../categories/categories.service");
const tags_service_1 = require("../tags/tags.service");
const points_service_1 = require("../points/points.service");
let AdminService = class AdminService {
    constructor(postRepository, replyRepository, userRepository, categoryRepository, tagRepository, postTagRepository, banRepository, settingRepository, operationLogRepository, dataSource, statsService, settingsService, logsService, bansService, categoriesService, tagsService, pointsService) {
        this.postRepository = postRepository;
        this.replyRepository = replyRepository;
        this.userRepository = userRepository;
        this.categoryRepository = categoryRepository;
        this.tagRepository = tagRepository;
        this.postTagRepository = postTagRepository;
        this.banRepository = banRepository;
        this.settingRepository = settingRepository;
        this.operationLogRepository = operationLogRepository;
        this.dataSource = dataSource;
        this.statsService = statsService;
        this.settingsService = settingsService;
        this.logsService = logsService;
        this.bansService = bansService;
        this.categoriesService = categoriesService;
        this.tagsService = tagsService;
        this.pointsService = pointsService;
    }
    async getStats() {
        return this.statsService.getDashboardStats();
    }
    async getBadgeCounts() {
        const pending_posts = await this.postRepository.count({
            where: { status: 'pending' },
        });
        const pending_replies = await this.replyRepository.count({
            where: { status: 'pending' },
        });
        const pending_avatars = await this.userRepository.count({
            where: { avatar_status: 'pending' },
        });
        const announce_setting = await this.settingsService.get('show_announcement');
        const show_announce = announce_setting === 'true';
        return {
            pending_posts,
            pending_replies,
            pending_avatars,
            show_announce,
        };
    }
    async getPosts(query) {
        const { page, limit, status, category_id } = query;
        const skip = (page - 1) * limit;
        const where = {};
        if (status && status !== 'all')
            where.status = status;
        if (category_id)
            where.category_id = category_id;
        const [data, total] = await this.postRepository.findAndCount({
            where,
            relations: ['user', 'category'],
            select: {
                id: true,
                user_id: true,
                category_id: true,
                title: true,
                status: true,
                is_pinned: true,
                view_count: true,
                like_count: true,
                created_at: true,
                updated_at: true,
                user: {
                    id: true,
                    username: true,
                    email: true,
                },
                category: {
                    id: true,
                    name: true,
                },
            },
            order: { created_at: 'DESC' },
            skip,
            take: limit,
        });
        const totalPages = Math.ceil(total / limit);
        return {
            data,
            total,
            page,
            limit,
            totalPages,
        };
    }
    async bulkDeletePosts(postIds) {
        return this.dataSource.transaction(async (manager) => {
            for (const postId of postIds) {
                await manager.softDelete(index_1.Post, postId);
            }
        });
    }
    async bulkPinPosts(postIds, isPinned) {
        await this.postRepository.update(postIds, { is_pinned: isPinned });
    }
    async bulkMovePosts(postIds, categoryId) {
        const category = await this.categoryRepository.findOne({
            where: { id: categoryId },
        });
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        await this.postRepository.update(postIds, { category_id: categoryId });
    }
    async pinPost(id, isPinned) {
        await this.postRepository.update(id, { is_pinned: isPinned });
        const post = await this.postRepository.findOne({
            where: { id },
            relations: ['user', 'category'],
        });
        if (!post) {
            throw new common_1.NotFoundException('Post not found');
        }
        return post;
    }
    async movePost(id, categoryId) {
        const category = await this.categoryRepository.findOne({
            where: { id: categoryId },
        });
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        await this.postRepository.update(id, { category_id: categoryId });
        const post = await this.postRepository.findOne({
            where: { id },
            relations: ['user', 'category'],
        });
        if (!post) {
            throw new common_1.NotFoundException('Post not found');
        }
        return post;
    }
    async getModerationQueue(type, page, limit) {
        const skip = (page - 1) * limit;
        if (type === 'posts' || type === 'post' || type === 'all') {
            const [data, total] = await this.postRepository.findAndCount({
                where: { status: 'pending' },
                relations: ['user', 'category'],
                order: { created_at: 'ASC' },
                skip,
                take: limit,
            });
            const totalPages = Math.ceil(total / limit);
            return {
                data: data.map((item) => ({
                    id: item.id,
                    item_type: 'post',
                    title: item.title,
                    content: item.content,
                    author_username: item.user?.username || '',
                    created_at: item.created_at,
                })),
                total,
                page,
                limit,
                totalPages,
            };
        }
        else if (type === 'replies' || type === 'reply') {
            const [data, total] = await this.replyRepository.findAndCount({
                where: { status: 'pending' },
                relations: ['user', 'post'],
                order: { created_at: 'ASC' },
                skip,
                take: limit,
            });
            const totalPages = Math.ceil(total / limit);
            return {
                data: data.map((item) => ({
                    id: item.id,
                    item_type: 'reply',
                    content: item.content,
                    author_username: item.user?.username || '',
                    created_at: item.created_at,
                    post_id: item.post_id,
                })),
                total,
                page,
                limit,
                totalPages,
            };
        }
        else if (type === 'avatars' || type === 'avatar') {
            const [data, total] = await this.userRepository.findAndCount({
                where: { avatar_status: 'pending' },
                order: { updated_at: 'ASC' },
                skip,
                take: limit,
            });
            const totalPages = Math.ceil(total / limit);
            return {
                data: data.map((item) => ({
                    id: item.id,
                    item_type: 'avatar',
                    content: item.pending_avatar_url || '',
                    author_username: item.username || '',
                    created_at: item.updated_at,
                    avatar_url: item.pending_avatar_url,
                })),
                total,
                page,
                limit,
                totalPages,
            };
        }
        return {
            data: [],
            total: 0,
            page,
            limit,
            totalPages: 0,
        };
    }
    async approvePost(id) {
        const post = await this.postRepository.findOne({ where: { id } });
        if (!post) {
            throw new common_1.NotFoundException('Post not found');
        }
        await this.postRepository.update(id, { status: 'published' });
        if (post.status !== 'published') {
            await this.pointsService.awardPoints(post.user_id, 'create_post', 'post', post.id);
        }
    }
    async rejectPost(id) {
        await this.postRepository.update(id, { status: 'deleted' });
    }
    async approveReply(id) {
        const reply = await this.replyRepository.findOne({ where: { id } });
        if (!reply) {
            throw new common_1.NotFoundException('Reply not found');
        }
        await this.replyRepository.update(id, { status: 'published' });
        if (reply.status !== 'published') {
            await this.pointsService.awardPoints(reply.user_id, 'create_reply', 'reply', reply.id);
        }
    }
    async rejectReply(id) {
        await this.replyRepository.update(id, { status: 'deleted', deleted_at: new Date() });
    }
    async approveAvatar(userId) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (!user.pending_avatar_url) {
            throw new common_1.BadRequestException('No pending avatar');
        }
        user.avatar_url = user.pending_avatar_url;
        user.pending_avatar_url = null;
        user.avatar_status = 'approved';
        await this.userRepository.save(user);
    }
    async rejectAvatar(userId) {
        await this.userRepository.update(userId, {
            pending_avatar_url: null,
            avatar_status: 'rejected',
        });
    }
    async approveModerationItem(type, id) {
        if (type === 'reply' || type === 'replies')
            return this.approveReply(id);
        if (type === 'avatar' || type === 'avatars')
            return this.approveAvatar(id);
        return this.approvePost(id);
    }
    async rejectModerationItem(type, id) {
        if (type === 'reply' || type === 'replies')
            return this.rejectReply(id);
        if (type === 'avatar' || type === 'avatars')
            return this.rejectAvatar(id);
        return this.rejectPost(id);
    }
    async mergeTags(fromId, toId) {
        return this.dataSource.transaction(async (manager) => {
            const fromTag = await manager.findOne(index_1.Tag, { where: { id: fromId } });
            const toTag = await manager.findOne(index_1.Tag, { where: { id: toId } });
            if (!fromTag || !toTag) {
                throw new common_1.NotFoundException('Tag not found');
            }
            await manager.query('UPDATE post_tags SET tag_id = ? WHERE tag_id = ?', [toId, fromId]);
            await manager.delete(index_1.Tag, fromId);
        });
    }
    async cleanupLogs() {
        const retentionDays = await this.settingsService.getNumber('cleanup_log_retention_days');
        const days = retentionDays || 365;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const result = await this.operationLogRepository.delete({
            created_at: (0, typeorm_2.LessThan)(cutoffDate),
        });
        return result.affected || 0;
    }
    async cleanupSoftDeleted() {
        const retentionDays = await this.settingsService.getNumber('cleanup_soft_delete_retention_days');
        const days = retentionDays || 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        let count = 0;
        const postsResult = await this.postRepository.createQueryBuilder()
            .delete()
            .where('deleted_at < :cutoffDate', { cutoffDate })
            .execute();
        count += postsResult.affected || 0;
        const repliesResult = await this.replyRepository.createQueryBuilder()
            .delete()
            .where('deleted_at < :cutoffDate', { cutoffDate })
            .execute();
        count += repliesResult.affected || 0;
        return count;
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(index_1.Post)),
    __param(1, (0, typeorm_1.InjectRepository)(index_1.Reply)),
    __param(2, (0, typeorm_1.InjectRepository)(index_1.User)),
    __param(3, (0, typeorm_1.InjectRepository)(index_1.Category)),
    __param(4, (0, typeorm_1.InjectRepository)(index_1.Tag)),
    __param(5, (0, typeorm_1.InjectRepository)(index_1.PostTag)),
    __param(6, (0, typeorm_1.InjectRepository)(index_1.Ban)),
    __param(7, (0, typeorm_1.InjectRepository)(index_1.Setting)),
    __param(8, (0, typeorm_1.InjectRepository)(index_1.OperationLog)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource,
        stats_service_1.StatsService,
        settings_service_1.SettingsService,
        logs_service_1.LogsService,
        bans_service_1.BansService,
        categories_service_1.CategoriesService,
        tags_service_1.TagsService,
        points_service_1.PointsService])
], AdminService);
//# sourceMappingURL=admin.service.js.map
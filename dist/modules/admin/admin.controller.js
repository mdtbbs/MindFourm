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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const admin_service_1 = require("./admin.service");
const stats_service_1 = require("../stats/stats.service");
const settings_service_1 = require("../settings/settings.service");
const logs_service_1 = require("../logs/logs.service");
const bans_service_1 = require("../bans/bans.service");
const categories_service_1 = require("../categories/categories.service");
const tags_service_1 = require("../tags/tags.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const bulk_posts_dto_1 = require("./dto/bulk-posts.dto");
const merge_tags_dto_1 = require("./dto/merge-tags.dto");
const search_util_1 = require("../../common/utils/search.util");
let AdminController = class AdminController {
    constructor(adminService, statsService, settingsService, logsService, bansService, categoriesService, tagsService) {
        this.adminService = adminService;
        this.statsService = statsService;
        this.settingsService = settingsService;
        this.logsService = logsService;
        this.bansService = bansService;
        this.categoriesService = categoriesService;
        this.tagsService = tagsService;
    }
    async getStats() {
        return this.adminService.getStats();
    }
    async getBadgeCounts() {
        return this.adminService.getBadgeCounts();
    }
    async getAllSettings() {
        return this.settingsService.getAll();
    }
    async getCategorySettings(category) {
        return this.settingsService.getByCategory(category);
    }
    async updateSettings(category, settings) {
        await this.settingsService.setBatch(category, settings);
        return { message: 'Settings updated' };
    }
    async getUsers(page = 1, limit = 20, search) {
        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const where = {};
        if (search) {
            where.username = (0, typeorm_1.Like)(`%${(0, search_util_1.escapeLike)(search)}%`);
        }
        return {
            data: [],
            total: 0,
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            totalPages: 0,
        };
    }
    async updateUserRole(id, body) {
        return { message: `User ${id} role updated to ${body.role}` };
    }
    async getPosts(page = 1, limit = 20, status, category_id) {
        return this.adminService.getPosts({
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            status,
            category_id: category_id ? parseInt(category_id, 10) : undefined,
        });
    }
    async bulkDeletePosts(dto) {
        await this.adminService.bulkDeletePosts(dto.post_ids);
        return { message: `${dto.post_ids.length} posts deleted` };
    }
    async bulkPinPosts(dto) {
        await this.adminService.bulkPinPosts(dto.post_ids, dto.is_pinned ?? 1);
        return { message: `${dto.post_ids.length} posts pinned` };
    }
    async bulkMovePosts(dto) {
        if (!dto.category_id) {
            throw new Error('category_id is required');
        }
        await this.adminService.bulkMovePosts(dto.post_ids, dto.category_id);
        return { message: `${dto.post_ids.length} posts moved` };
    }
    async pinPost(id, body) {
        return this.adminService.pinPost(id, body.is_pinned);
    }
    async movePost(id, body) {
        return this.adminService.movePost(id, body.category_id);
    }
    async createCategory(dto) {
        return this.categoriesService.create(dto);
    }
    async updateCategory(id, dto) {
        return this.categoriesService.update(id, dto);
    }
    async deleteCategory(id) {
        await this.categoriesService.delete(id);
        return { message: 'Category deleted' };
    }
    async getTags(page = 1, limit = 20) {
        return this.tagsService.findAll(parseInt(page, 10), parseInt(limit, 10));
    }
    async createTag(dto) {
        return this.tagsService.create(dto);
    }
    async updateTag(id, dto) {
        return this.tagsService.update(id, dto);
    }
    async deleteTag(id) {
        await this.tagsService.delete(id);
        return { message: 'Tag deleted' };
    }
    async mergeTags(dto) {
        await this.adminService.mergeTags(dto.from_tag_id, dto.to_tag_id);
        return { message: 'Tags merged' };
    }
    async getModerationQueue(page = 1, limit = 20, type = 'all') {
        return this.adminService.getModerationQueue(type, parseInt(page, 10), parseInt(limit, 10));
    }
    async approveItem(id, type = 'post', req) {
        await this.adminService.approveModerationItem(type, id);
        await this.logOperation(req, 'moderation.approve', type, id);
        return { message: 'Item approved' };
    }
    async rejectItem(id, type = 'post', req) {
        await this.adminService.rejectModerationItem(type, id);
        await this.logOperation(req, 'moderation.reject', type, id);
        return { message: 'Item rejected' };
    }
    async getBans(page = 1, limit = 20, ban_type, is_active) {
        return this.bansService.getList({
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            ban_type,
            is_active: is_active !== undefined ? parseInt(is_active, 10) : undefined,
        });
    }
    async createBan(dto, user_id) {
        return this.bansService.create({
            ban_type: dto.ban_type,
            value: dto.value,
            reason: dto.reason,
            created_by: user_id,
        });
    }
    async updateBan(id, updates) {
        return this.bansService.update(id, updates);
    }
    async deactivateBan(id) {
        await this.bansService.deactivate(id);
        return { message: 'Ban deactivated' };
    }
    async cleanupSessions() {
        return { message: 'Sessions cleaned up' };
    }
    async cleanupLogs(req) {
        const count = await this.adminService.cleanupLogs();
        await this.logOperation(req, 'cleanup.logs', 'operation_log', undefined, { count });
        return { message: `${count} logs cleaned up` };
    }
    async cleanupSoftDeleted() {
        const count = await this.adminService.cleanupSoftDeleted();
        return { message: `${count} items cleaned up` };
    }
    async getLogs(page = 1, limit = 20, user_id, action, target_type) {
        return this.logsService.getLogs({
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            user_id: user_id ? parseInt(user_id, 10) : undefined,
            action,
            target_type,
        });
    }
    async logOperation(req, action, targetType, targetId, details) {
        await this.logsService.log({
            user_id: req.user?.id,
            action,
            target_type: targetType,
            target_id: targetId,
            details: details ? JSON.stringify(details) : undefined,
            ip_address: this.getClientIp(req),
            user_agent: req.headers?.['user-agent'],
        }).catch((err) => console.warn('operation log failed:', err.message));
    }
    getClientIp(req) {
        return (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('stats'),
    (0, roles_decorator_1.Roles)('moderator', 'admin'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('badge-counts'),
    (0, roles_decorator_1.Roles)('moderator', 'admin'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getBadgeCounts", null);
__decorate([
    (0, common_1.Get)('settings'),
    (0, roles_decorator_1.Roles)('admin'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getAllSettings", null);
__decorate([
    (0, common_1.Get)('settings/:category'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getCategorySettings", null);
__decorate([
    (0, common_1.Put)('settings/:category'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('category')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateSettings", null);
__decorate([
    (0, common_1.Get)('users'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getUsers", null);
__decorate([
    (0, common_1.Put)('users/:id/role'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateUserRole", null);
__decorate([
    (0, common_1.Get)('posts'),
    (0, roles_decorator_1.Roles)('moderator', 'admin'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('category_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getPosts", null);
__decorate([
    (0, common_1.Delete)('posts'),
    (0, roles_decorator_1.Roles)('moderator', 'admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bulk_posts_dto_1.BulkPostsDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "bulkDeletePosts", null);
__decorate([
    (0, common_1.Put)('posts/pin'),
    (0, roles_decorator_1.Roles)('moderator', 'admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bulk_posts_dto_1.BulkPostsDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "bulkPinPosts", null);
__decorate([
    (0, common_1.Put)('posts/move'),
    (0, roles_decorator_1.Roles)('moderator', 'admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bulk_posts_dto_1.BulkPostsDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "bulkMovePosts", null);
__decorate([
    (0, common_1.Put)('posts/:id/pin'),
    (0, roles_decorator_1.Roles)('moderator', 'admin'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "pinPost", null);
__decorate([
    (0, common_1.Put)('posts/:id/move'),
    (0, roles_decorator_1.Roles)('moderator', 'admin'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "movePost", null);
__decorate([
    (0, common_1.Post)('categories'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createCategory", null);
__decorate([
    (0, common_1.Put)('categories/:id'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateCategory", null);
__decorate([
    (0, common_1.Delete)('categories/:id'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteCategory", null);
__decorate([
    (0, common_1.Get)('tags'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getTags", null);
__decorate([
    (0, common_1.Post)('tags'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createTag", null);
__decorate([
    (0, common_1.Put)('tags/:id'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateTag", null);
__decorate([
    (0, common_1.Delete)('tags/:id'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteTag", null);
__decorate([
    (0, common_1.Post)('tags/merge'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [merge_tags_dto_1.MergeTagsDto]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "mergeTags", null);
__decorate([
    (0, common_1.Get)('moderation'),
    (0, roles_decorator_1.Roles)('moderator', 'admin'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getModerationQueue", null);
__decorate([
    (0, common_1.Put)('moderation/:id/approve'),
    (0, roles_decorator_1.Roles)('moderator', 'admin'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)('type')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "approveItem", null);
__decorate([
    (0, common_1.Put)('moderation/:id/reject'),
    (0, roles_decorator_1.Roles)('moderator', 'admin'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)('type')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "rejectItem", null);
__decorate([
    (0, common_1.Get)('bans'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('ban_type')),
    __param(3, (0, common_1.Query)('is_active')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getBans", null);
__decorate([
    (0, common_1.Post)('bans'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Query)('user_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createBan", null);
__decorate([
    (0, common_1.Put)('bans/:id'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateBan", null);
__decorate([
    (0, common_1.Delete)('bans/:id'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deactivateBan", null);
__decorate([
    (0, common_1.Post)('cleanup/sessions'),
    (0, roles_decorator_1.Roles)('admin'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "cleanupSessions", null);
__decorate([
    (0, common_1.Post)('cleanup/logs'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "cleanupLogs", null);
__decorate([
    (0, common_1.Post)('cleanup/soft-deleted'),
    (0, roles_decorator_1.Roles)('admin'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "cleanupSoftDeleted", null);
__decorate([
    (0, common_1.Get)('logs'),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('user_id')),
    __param(3, (0, common_1.Query)('action')),
    __param(4, (0, common_1.Query)('target_type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, Number, String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getLogs", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [admin_service_1.AdminService,
        stats_service_1.StatsService,
        settings_service_1.SettingsService,
        logs_service_1.LogsService,
        bans_service_1.BansService,
        categories_service_1.CategoriesService,
        tags_service_1.TagsService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map
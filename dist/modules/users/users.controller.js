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
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const users_service_1 = require("./users.service");
const update_profile_dto_1 = require("./dto/update-profile.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const logs_service_1 = require("../logs/logs.service");
let UsersController = class UsersController {
    constructor(usersService, logsService) {
        this.usersService = usersService;
        this.logsService = logsService;
    }
    async getCurrentUser(req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new Error('Not authenticated');
        }
        return this.usersService.getById(userId);
    }
    async updateProfile(req, dto) {
        const userId = req.user?.id;
        if (!userId) {
            throw new Error('Not authenticated');
        }
        const user = await this.usersService.updateProfile(userId, dto);
        await this.logOperation(req, 'user.profile.update', 'user', userId, {
            username_changed: dto.username !== undefined,
            bio_changed: dto.bio !== undefined,
        });
        return user;
    }
    async uploadAvatar(req, file) {
        const userId = req.user?.id;
        if (!userId) {
            throw new Error('Not authenticated');
        }
        if (!file) {
            throw new Error('No file uploaded');
        }
        const avatarUrl = `/uploads/avatars/${file.filename}`;
        const user = await this.usersService.updateAvatar(userId, avatarUrl);
        await this.logOperation(req, 'user.avatar.upload', 'user', userId, {
            avatar_status: user.avatar_status,
            pending: user.avatar_status === 'pending',
        });
        return user;
    }
    async removeAvatar(req) {
        const userId = req.user?.id;
        if (!userId) {
            throw new Error('Not authenticated');
        }
        const user = await this.usersService.removeAvatar(userId);
        await this.logOperation(req, 'user.avatar.remove', 'user', userId);
        return user;
    }
    async getCurrentUserReplies(req, page, limit) {
        const userId = req.user?.id;
        if (!userId) {
            throw new Error('Not authenticated');
        }
        return this.usersService.getRepliesByUserId(userId, page || 1, limit || 20);
    }
    async searchUsers(query, limit) {
        if (!query) {
            return [];
        }
        return this.usersService.searchByUsername(query, limit || 10);
    }
    async getUserById(id) {
        return this.usersService.getById(parseInt(id, 10));
    }
    async getUserReplies(id, page, limit) {
        return this.usersService.getRepliesByUserId(parseInt(id, 10), page || 1, limit || 20);
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
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)('me'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getCurrentUser", null);
__decorate([
    (0, common_1.Put)('me/profile'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_profile_dto_1.UpdateProfileDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Post)('me/avatar'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('avatar')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "uploadAvatar", null);
__decorate([
    (0, common_1.Delete)('me/avatar'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "removeAvatar", null);
__decorate([
    (0, common_1.Get)('me/replies'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Number]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getCurrentUserReplies", null);
__decorate([
    (0, common_1.Get)('search'),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "searchUsers", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getUserById", null);
__decorate([
    (0, common_1.Get)(':id/replies'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Number]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getUserReplies", null);
exports.UsersController = UsersController = __decorate([
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        logs_service_1.LogsService])
], UsersController);
//# sourceMappingURL=users.controller.js.map
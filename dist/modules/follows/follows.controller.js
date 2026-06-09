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
exports.FollowsController = void 0;
const common_1 = require("@nestjs/common");
const follows_service_1 = require("./follows.service");
const follow_dto_1 = require("./dto/follow.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
let FollowsController = class FollowsController {
    constructor(followsService) {
        this.followsService = followsService;
    }
    async followUser(followingId, dto) {
        const follow = await this.followsService.followUser(dto.followerId, followingId);
        return { success: true, data: follow };
    }
    async unfollowUser(followingId, followerId) {
        await this.followsService.unfollowUser(followerId, followingId);
        return { success: true, data: { message: '已取消关注' } };
    }
    async checkFollowStatus(followingId, followerId) {
        const isFollowing = await this.followsService.checkFollowStatus(followerId, followingId);
        return { success: true, data: { isFollowing } };
    }
    async getFollowers(userId, query) {
        const result = await this.followsService.getFollowers(userId, query.page || 1, query.limit || 20);
        return { success: true, data: result };
    }
    async getFollowing(userId, query) {
        const result = await this.followsService.getFollowing(userId, query.page || 1, query.limit || 20);
        return { success: true, data: result };
    }
    async getFollowCounts(userId) {
        const counts = await this.followsService.getFollowCounts(userId);
        return { success: true, data: counts };
    }
};
exports.FollowsController = FollowsController;
__decorate([
    (0, common_1.Post)(':userId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, follow_dto_1.FollowUserDto]),
    __metadata("design:returntype", Promise)
], FollowsController.prototype, "followUser", null);
__decorate([
    (0, common_1.Delete)(':userId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Query)('followerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], FollowsController.prototype, "unfollowUser", null);
__decorate([
    (0, common_1.Get)('check/:userId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Query)('followerId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], FollowsController.prototype, "checkFollowStatus", null);
__decorate([
    (0, common_1.Get)('user/:userId/followers'),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, follow_dto_1.QueryFollowsDto]),
    __metadata("design:returntype", Promise)
], FollowsController.prototype, "getFollowers", null);
__decorate([
    (0, common_1.Get)('user/:userId/following'),
    __param(0, (0, common_1.Param)('userId')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, follow_dto_1.QueryFollowsDto]),
    __metadata("design:returntype", Promise)
], FollowsController.prototype, "getFollowing", null);
__decorate([
    (0, common_1.Get)('user/:userId/stats'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], FollowsController.prototype, "getFollowCounts", null);
exports.FollowsController = FollowsController = __decorate([
    (0, common_1.Controller)('follows'),
    __metadata("design:paramtypes", [follows_service_1.FollowsService])
], FollowsController);
//# sourceMappingURL=follows.controller.js.map
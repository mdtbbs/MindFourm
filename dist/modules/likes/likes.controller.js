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
exports.LikesController = void 0;
const common_1 = require("@nestjs/common");
const likes_service_1 = require("./likes.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const public_decorator_1 = require("../../common/decorators/public.decorator");
let LikesController = class LikesController {
    constructor(likesService) {
        this.likesService = likesService;
    }
    async likePost(postId, req) {
        await this.likesService.likePost(req.user?.id, postId);
        return { message: 'Post liked successfully' };
    }
    async unlikePost(postId, req) {
        await this.likesService.unlikePost(req.user?.id, postId);
        return { message: 'Post unliked successfully' };
    }
    async checkPostLike(postId, userId) {
        const uid = userId ? Number(userId) : undefined;
        const isLiked = uid ? await this.likesService.isPostLiked(uid, postId) : false;
        const likeCount = await this.likesService.getPostLikeCount(postId);
        return { liked: isLiked, count: likeCount };
    }
    async getUserLikedPosts(req, page = '1', limit = '20') {
        return this.likesService.getUserLikedPosts(req.user?.id, Number(page), Number(limit));
    }
    async likeReply(replyId, req) {
        await this.likesService.likeReply(req.user?.id, replyId);
        return { message: 'Reply liked successfully' };
    }
    async unlikeReply(replyId, req) {
        await this.likesService.unlikeReply(req.user?.id, replyId);
        return { message: 'Reply unliked successfully' };
    }
    async checkReplyLike(replyId, userId) {
        const uid = userId ? Number(userId) : undefined;
        const isLiked = uid ? await this.likesService.isReplyLiked(uid, replyId) : false;
        const likeCount = await this.likesService.getReplyLikeCount(replyId);
        return { liked: isLiked, count: likeCount };
    }
    async getUserReceivedLikeCount(userId) {
        return { count: await this.likesService.getUserReceivedLikeCount(userId) };
    }
};
exports.LikesController = LikesController;
__decorate([
    (0, common_1.Post)('posts/:postId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('postId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], LikesController.prototype, "likePost", null);
__decorate([
    (0, common_1.Delete)('posts/:postId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('postId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], LikesController.prototype, "unlikePost", null);
__decorate([
    (0, common_1.Get)('posts/:postId'),
    (0, public_decorator_1.Public)(),
    __param(0, (0, common_1.Param)('postId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", Promise)
], LikesController.prototype, "checkPostLike", null);
__decorate([
    (0, common_1.Get)('posts'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], LikesController.prototype, "getUserLikedPosts", null);
__decorate([
    (0, common_1.Post)('replies/:replyId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('replyId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], LikesController.prototype, "likeReply", null);
__decorate([
    (0, common_1.Delete)('replies/:replyId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('replyId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], LikesController.prototype, "unlikeReply", null);
__decorate([
    (0, common_1.Get)('replies/:replyId'),
    (0, public_decorator_1.Public)(),
    __param(0, (0, common_1.Param)('replyId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", Promise)
], LikesController.prototype, "checkReplyLike", null);
__decorate([
    (0, common_1.Get)('users/:userId/count'),
    (0, public_decorator_1.Public)(),
    __param(0, (0, common_1.Param)('userId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], LikesController.prototype, "getUserReceivedLikeCount", null);
exports.LikesController = LikesController = __decorate([
    (0, common_1.Controller)('likes'),
    __metadata("design:paramtypes", [likes_service_1.LikesService])
], LikesController);
//# sourceMappingURL=likes.controller.js.map
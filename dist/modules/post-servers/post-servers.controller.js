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
exports.PostServersController = void 0;
const common_1 = require("@nestjs/common");
const post_servers_service_1 = require("./post-servers.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const service_auth_guard_1 = require("../../common/guards/service-auth.guard");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const link_post_server_dto_1 = require("./dto/link-post-server.dto");
let PostServersController = class PostServersController {
    constructor(postServersService) {
        this.postServersService = postServersService;
    }
    async getByServer(serverId) {
        return this.postServersService.getPostsByServer(Number(serverId));
    }
    async getMyServers() {
        return { message: 'Use /api/servers/my endpoint' };
    }
    async getForumPosts(serverId) {
        return this.postServersService.getForumPostsByServer(Number(serverId));
    }
    async linkPost(dto, req) {
        return this.postServersService.linkPostToServer(dto.postId, dto.serverId, req.user.id);
    }
    async unlinkPost(postId, req) {
        return this.postServersService.unlinkPostFromServer(Number(postId), req.user.id);
    }
};
exports.PostServersController = PostServersController;
__decorate([
    (0, common_1.Get)('by-server/:serverId'),
    (0, public_decorator_1.Public)(),
    __param(0, (0, common_1.Param)('serverId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PostServersController.prototype, "getByServer", null);
__decorate([
    (0, common_1.Get)('my'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PostServersController.prototype, "getMyServers", null);
__decorate([
    (0, common_1.Get)('forum-posts/:serverId'),
    (0, common_1.UseGuards)(service_auth_guard_1.ServiceAuthGuard),
    __param(0, (0, common_1.Param)('serverId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PostServersController.prototype, "getForumPosts", null);
__decorate([
    (0, common_1.Post)('link'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [link_post_server_dto_1.LinkPostServerDto, Object]),
    __metadata("design:returntype", Promise)
], PostServersController.prototype, "linkPost", null);
__decorate([
    (0, common_1.Delete)(':postId/server'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('postId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PostServersController.prototype, "unlinkPost", null);
exports.PostServersController = PostServersController = __decorate([
    (0, common_1.Controller)('post-servers'),
    __metadata("design:paramtypes", [post_servers_service_1.PostServersService])
], PostServersController);
//# sourceMappingURL=post-servers.controller.js.map
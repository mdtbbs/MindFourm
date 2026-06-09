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
exports.RepliesControllerMain = exports.RepliesController = void 0;
const common_1 = require("@nestjs/common");
const replies_service_1 = require("./replies.service");
const create_reply_dto_1 = require("./dto/create-reply.dto");
const update_reply_dto_1 = require("./dto/update-reply.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
let RepliesController = class RepliesController {
    constructor(repliesService) {
        this.repliesService = repliesService;
    }
    async getRepliesByPost(postId, page, limit) {
        return this.repliesService.getByPostId(Number(postId), page ? Number(page) : 1, limit ? Number(limit) : 20);
    }
    async createReply(postId, dto, req) {
        const userId = req.user.id;
        return this.repliesService.createReplyForPost(Number(postId), dto, userId);
    }
};
exports.RepliesController = RepliesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('postId')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, Number]),
    __metadata("design:returntype", Promise)
], RepliesController.prototype, "getRepliesByPost", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('postId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, create_reply_dto_1.CreateReplyDto, Object]),
    __metadata("design:returntype", Promise)
], RepliesController.prototype, "createReply", null);
exports.RepliesController = RepliesController = __decorate([
    (0, common_1.Controller)('posts/:postId/replies'),
    __metadata("design:paramtypes", [replies_service_1.RepliesService])
], RepliesController);
let RepliesControllerMain = class RepliesControllerMain {
    constructor(repliesService) {
        this.repliesService = repliesService;
    }
    async getReplyById(id) {
        return this.repliesService.findById(Number(id));
    }
    async updateReply(id, dto, req) {
        const userId = req.user.id;
        return this.repliesService.update(Number(id), dto.content, userId);
    }
    async deleteReply(id, req) {
        const userId = req.user.id;
        await this.repliesService.softDelete(Number(id), userId);
        return { message: 'Reply deleted successfully' };
    }
};
exports.RepliesControllerMain = RepliesControllerMain;
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], RepliesControllerMain.prototype, "getReplyById", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_reply_dto_1.UpdateReplyDto, Object]),
    __metadata("design:returntype", Promise)
], RepliesControllerMain.prototype, "updateReply", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], RepliesControllerMain.prototype, "deleteReply", null);
exports.RepliesControllerMain = RepliesControllerMain = __decorate([
    (0, common_1.Controller)('replies'),
    __metadata("design:paramtypes", [replies_service_1.RepliesService])
], RepliesControllerMain);
//# sourceMappingURL=replies.controller.js.map
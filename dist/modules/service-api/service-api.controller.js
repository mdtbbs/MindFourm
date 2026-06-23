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
exports.ServiceApiController = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const posts_service_1 = require("../posts/posts.service");
const replies_service_1 = require("../replies/replies.service");
const forum_api_key_guard_1 = require("../../common/guards/forum-api-key.guard");
const skip_phone_verification_decorator_1 = require("../../common/decorators/skip-phone-verification.decorator");
const service_create_post_dto_1 = require("./dto/service-create-post.dto");
const service_create_reply_dto_1 = require("./dto/service-create-reply.dto");
let ServiceApiController = class ServiceApiController {
    constructor(userRepository, postsService, repliesService) {
        this.userRepository = userRepository;
        this.postsService = postsService;
        this.repliesService = repliesService;
    }
    async createPost(body) {
        const user = await this.resolveWritableUser(body);
        const post = await this.postsService.create({
            title: body.title,
            content: body.content,
            category_id: body.category_id,
            server_id: body.server_id,
            required_group_id: body.required_group_id,
            post_type: body.post_type,
            tags: body.tags,
            status: body.status,
        }, user.id);
        return {
            success: true,
            user_id: user.id,
            post_id: post?.id ?? null,
            status: post?.status ?? null,
            post,
        };
    }
    async createReply(postId, body) {
        const user = await this.resolveWritableUser(body);
        const reply = await this.repliesService.createReplyForPost(postId, {
            content: body.content,
            parent_reply_id: body.parent_reply_id,
        }, user.id);
        return {
            success: true,
            user_id: user.id,
            post_id: postId,
            reply_id: reply.id,
            status: reply.status,
            reply,
        };
    }
    async resolveWritableUser(selector) {
        const selectors = [
            selector.user_id !== undefined,
            selector.mindauth_id !== undefined,
            selector.username !== undefined && selector.username.trim() !== '',
        ].filter(Boolean);
        if (selectors.length !== 1) {
            throw new common_1.BadRequestException('必须且只能提供 user_id、mindauth_id、username 其中一个账号标识');
        }
        let where;
        if (selector.user_id !== undefined) {
            where = { id: selector.user_id };
        }
        else if (selector.mindauth_id !== undefined) {
            where = { mindauth_id: selector.mindauth_id };
        }
        else {
            where = { username: selector.username.trim() };
        }
        const user = await this.userRepository.findOne({ where });
        if (!user) {
            throw new common_1.NotFoundException('指定账号不存在');
        }
        if (!user.phone_verified) {
            throw new common_1.ForbiddenException({
                code: 'PHONE_NOT_VERIFIED',
                message: '指定账号未验证手机号，不能执行写操作',
            });
        }
        return user;
    }
};
exports.ServiceApiController = ServiceApiController;
__decorate([
    (0, common_1.Post)('posts'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [service_create_post_dto_1.ServiceCreatePostDto]),
    __metadata("design:returntype", Promise)
], ServiceApiController.prototype, "createPost", null);
__decorate([
    (0, common_1.Post)('posts/:postId/replies'),
    __param(0, (0, common_1.Param)('postId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, service_create_reply_dto_1.ServiceCreateReplyDto]),
    __metadata("design:returntype", Promise)
], ServiceApiController.prototype, "createReply", null);
exports.ServiceApiController = ServiceApiController = __decorate([
    (0, common_1.Controller)('service-api'),
    (0, skip_phone_verification_decorator_1.SkipPhoneVerification)(),
    (0, common_1.UseGuards)(forum_api_key_guard_1.ForumApiKeyGuard),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        posts_service_1.PostsService,
        replies_service_1.RepliesService])
], ServiceApiController);
//# sourceMappingURL=service-api.controller.js.map
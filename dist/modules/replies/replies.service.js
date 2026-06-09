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
exports.RepliesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const reply_entity_1 = require("../../entities/reply.entity");
const post_entity_1 = require("../../entities/post.entity");
const user_entity_1 = require("../../entities/user.entity");
const notifications_service_1 = require("../notifications/notifications.service");
const event_bus_service_1 = require("../plugins/event-bus.service");
const markdown_util_1 = require("../../common/utils/markdown.util");
const points_service_1 = require("../points/points.service");
let RepliesService = class RepliesService {
    constructor(replyRepository, postRepository, userRepository, notificationsService, eventBus, pointsService) {
        this.replyRepository = replyRepository;
        this.postRepository = postRepository;
        this.userRepository = userRepository;
        this.notificationsService = notificationsService;
        this.eventBus = eventBus;
        this.pointsService = pointsService;
    }
    async createReplyForPost(postId, dto, userId) {
        const { content, parent_reply_id } = dto;
        let modifiedDto = await this.eventBus.execute('reply.create', { ...dto, postId, userId });
        dto = modifiedDto;
        const post = await this.postRepository.findOne({
            where: { id: postId },
        });
        if (!post) {
            throw new common_1.NotFoundException('Post not found');
        }
        if (post.status !== 'published') {
            throw new common_1.ForbiddenException('Cannot reply to unpublished post');
        }
        if (parent_reply_id) {
            const parentReply = await this.replyRepository.findOne({
                where: { id: parent_reply_id },
            });
            if (!parentReply) {
                throw new common_1.NotFoundException('Parent reply not found');
            }
            if (parentReply.post_id !== postId) {
                throw new common_1.ForbiddenException('Parent reply does not belong to this post');
            }
        }
        const contentHtml = (0, markdown_util_1.parseMarkdown)(content);
        const user = await this.userRepository.findOne({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        const newReply = this.replyRepository.create({
            post_id: postId,
            user_id: userId,
            parent_reply_id: parent_reply_id,
            content,
            content_html: contentHtml,
            status: 'published',
            like_count: 0,
        });
        const savedReply = await this.replyRepository.save(newReply);
        if (post.user_id !== userId) {
            await this.notificationsService.create({
                user_id: post.user_id,
                type: 'reply',
                actor_id: userId,
                post_id: postId,
                reply_id: savedReply.id,
                content: content,
            });
        }
        await this.notificationsService.notifyMentionedUsers(content, postId, userId, savedReply.id);
        await this.awardPointsForReply(savedReply.id, userId);
        this.eventBus.execute('reply.created', { reply: savedReply, userId }).catch((err) => console.error('reply.created hook error:', err));
        return savedReply;
    }
    async awardPointsForReply(replyId, userId) {
        await this.pointsService.awardPoints(userId, 'create_reply', 'reply', replyId);
    }
    async getByPostId(postId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [replies, total] = await this.replyRepository.findAndCount({
            where: {
                post_id: postId,
                status: 'published',
            },
            relations: ['user'],
            order: {
                created_at: 'ASC',
            },
            skip,
            take: limit,
        });
        return {
            data: replies,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        };
    }
    async findById(id) {
        const reply = await this.replyRepository.findOne({
            where: { id },
            relations: ['user'],
        });
        if (!reply) {
            throw new common_1.NotFoundException('Reply not found');
        }
        if (reply.status === 'deleted') {
            throw new common_1.NotFoundException('Reply has been deleted');
        }
        return reply;
    }
    async update(id, content, userId) {
        const reply = await this.replyRepository.findOne({
            where: { id },
        });
        if (!reply) {
            throw new common_1.NotFoundException('Reply not found');
        }
        if (reply.user_id !== userId) {
            throw new common_1.ForbiddenException('You can only edit your own replies');
        }
        if (reply.status === 'deleted') {
            throw new common_1.ForbiddenException('Cannot update deleted reply');
        }
        const contentHtml = (0, markdown_util_1.parseMarkdown)(content);
        reply.content = content;
        reply.content_html = contentHtml;
        reply.updated_at = new Date();
        return await this.replyRepository.save(reply);
    }
    async softDelete(id, userId) {
        const reply = await this.replyRepository.findOne({
            where: { id },
        });
        if (!reply) {
            throw new common_1.NotFoundException('Reply not found');
        }
        if (reply.user_id !== userId) {
            throw new common_1.ForbiddenException('You can only delete your own replies');
        }
        reply.status = 'deleted';
        reply.deleted_at = new Date();
        await this.replyRepository.save(reply);
    }
};
exports.RepliesService = RepliesService;
exports.RepliesService = RepliesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(reply_entity_1.Reply)),
    __param(1, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        notifications_service_1.NotificationsService,
        event_bus_service_1.EventBusService,
        points_service_1.PointsService])
], RepliesService);
//# sourceMappingURL=replies.service.js.map
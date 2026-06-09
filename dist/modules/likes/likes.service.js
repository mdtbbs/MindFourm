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
exports.LikesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const post_like_entity_1 = require("../../entities/post-like.entity");
const reply_like_entity_1 = require("../../entities/reply-like.entity");
const post_entity_1 = require("../../entities/post.entity");
const reply_entity_1 = require("../../entities/reply.entity");
const notifications_service_1 = require("../notifications/notifications.service");
const points_service_1 = require("../points/points.service");
let LikesService = class LikesService {
    constructor(postLikeRepo, replyLikeRepo, postRepo, replyRepo, notificationsService, pointsService, dataSource) {
        this.postLikeRepo = postLikeRepo;
        this.replyLikeRepo = replyLikeRepo;
        this.postRepo = postRepo;
        this.replyRepo = replyRepo;
        this.notificationsService = notificationsService;
        this.pointsService = pointsService;
        this.dataSource = dataSource;
    }
    async likePost(userId, postId) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const post = await queryRunner.manager.findOne(post_entity_1.Post, { where: { id: postId } });
            if (!post)
                throw new common_1.NotFoundException('Post not found');
            const existing = await queryRunner.manager.findOne(post_like_entity_1.PostLike, {
                where: { user_id: userId, post_id: postId },
            });
            if (existing)
                throw new common_1.BadRequestException('Already liked');
            await queryRunner.manager.save(post_like_entity_1.PostLike, { user_id: userId, post_id: postId });
            await queryRunner.manager.increment(post_entity_1.Post, { id: postId }, 'like_count', 1);
            if (post.user_id !== userId) {
                await this.notificationsService.create({
                    user_id: post.user_id,
                    type: 'post_like',
                    actor_id: userId,
                    post_id: postId,
                });
                await this.pointsService.awardPoints(post.user_id, 'receive_like', 'post', postId);
            }
            await queryRunner.commitTransaction();
        }
        catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        }
        finally {
            await queryRunner.release();
        }
    }
    async unlikePost(userId, postId) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const like = await queryRunner.manager.findOne(post_like_entity_1.PostLike, {
                where: { user_id: userId, post_id: postId },
            });
            if (!like)
                throw new common_1.BadRequestException('Not liked');
            await queryRunner.manager.delete(post_like_entity_1.PostLike, { user_id: userId, post_id: postId });
            await queryRunner.manager.decrement(post_entity_1.Post, { id: postId }, 'like_count', 1);
            await queryRunner.commitTransaction();
        }
        catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        }
        finally {
            await queryRunner.release();
        }
    }
    async isPostLiked(userId, postId) {
        const like = await this.postLikeRepo.findOne({
            where: { user_id: userId, post_id: postId },
        });
        return !!like;
    }
    async getPostLikeCount(postId) {
        const post = await this.postRepo.findOne({ where: { id: postId }, select: ['like_count'] });
        return post?.like_count || 0;
    }
    async getUserLikedPosts(userId, page, limit) {
        const [posts, total] = await this.postRepo
            .createQueryBuilder('p')
            .innerJoin(post_like_entity_1.PostLike, 'pl', 'pl.post_id = p.id AND pl.user_id = :userId', { userId })
            .leftJoin('p.user', 'u')
            .leftJoin('p.category', 'c')
            .orderBy('p.created_at', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        return { posts, total };
    }
    async likeReply(userId, replyId) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const reply = await queryRunner.manager.findOne(reply_entity_1.Reply, { where: { id: replyId } });
            if (!reply)
                throw new common_1.NotFoundException('Reply not found');
            const existing = await queryRunner.manager.findOne(reply_like_entity_1.ReplyLike, {
                where: { user_id: userId, reply_id: replyId },
            });
            if (existing)
                throw new common_1.BadRequestException('Already liked');
            await queryRunner.manager.save(reply_like_entity_1.ReplyLike, { user_id: userId, reply_id: replyId });
            await queryRunner.manager.increment(reply_entity_1.Reply, { id: replyId }, 'like_count', 1);
            if (reply.user_id !== userId) {
                await this.notificationsService.create({
                    user_id: reply.user_id,
                    type: 'reply_like',
                    actor_id: userId,
                    reply_id: replyId,
                });
                await this.pointsService.awardPoints(reply.user_id, 'receive_like', 'reply', replyId);
            }
            await queryRunner.commitTransaction();
        }
        catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        }
        finally {
            await queryRunner.release();
        }
    }
    async unlikeReply(userId, replyId) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const like = await queryRunner.manager.findOne(reply_like_entity_1.ReplyLike, {
                where: { user_id: userId, reply_id: replyId },
            });
            if (!like)
                throw new common_1.BadRequestException('Not liked');
            await queryRunner.manager.delete(reply_like_entity_1.ReplyLike, { user_id: userId, reply_id: replyId });
            await queryRunner.manager.decrement(reply_entity_1.Reply, { id: replyId }, 'like_count', 1);
            await queryRunner.commitTransaction();
        }
        catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        }
        finally {
            await queryRunner.release();
        }
    }
    async isReplyLiked(userId, replyId) {
        const like = await this.replyLikeRepo.findOne({
            where: { user_id: userId, reply_id: replyId },
        });
        return !!like;
    }
    async getReplyLikeCount(replyId) {
        const reply = await this.replyRepo.findOne({ where: { id: replyId }, select: ['like_count'] });
        return reply?.like_count || 0;
    }
    async getUserReceivedLikeCount(userId) {
        const postResult = await this.postRepo
            .createQueryBuilder('p')
            .select('COALESCE(SUM(p.like_count), 0)', 'total')
            .where('p.user_id = :userId', { userId })
            .getRawOne();
        const replyResult = await this.replyRepo
            .createQueryBuilder('r')
            .select('COALESCE(SUM(r.like_count), 0)', 'total')
            .where('r.user_id = :userId', { userId })
            .getRawOne();
        return Math.floor(postResult?.total || 0) + Math.floor(replyResult?.total || 0);
    }
};
exports.LikesService = LikesService;
exports.LikesService = LikesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(post_like_entity_1.PostLike)),
    __param(1, (0, typeorm_1.InjectRepository)(reply_like_entity_1.ReplyLike)),
    __param(2, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __param(3, (0, typeorm_1.InjectRepository)(reply_entity_1.Reply)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        notifications_service_1.NotificationsService,
        points_service_1.PointsService,
        typeorm_2.DataSource])
], LikesService);
//# sourceMappingURL=likes.service.js.map
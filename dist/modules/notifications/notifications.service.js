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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const redis_service_1 = require("../../database/redis.service");
const notification_entity_1 = require("../../entities/notification.entity");
const user_entity_1 = require("../../entities/user.entity");
const post_entity_1 = require("../../entities/post.entity");
const reply_entity_1 = require("../../entities/reply.entity");
const email_log_entity_1 = require("../../entities/email-log.entity");
const email_queue_service_1 = require("./email-queue.service");
const email_templates_1 = require("./email.templates");
const settings_service_1 = require("../settings/settings.service");
let NotificationsService = class NotificationsService {
    constructor(notificationRepository, userRepository, postRepository, replyRepository, emailLogRepository, redisService, emailQueueService, settingsService) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.postRepository = postRepository;
        this.replyRepository = replyRepository;
        this.emailLogRepository = emailLogRepository;
        this.redisService = redisService;
        this.emailQueueService = emailQueueService;
        this.settingsService = settingsService;
        this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    }
    async getSiteName() {
        try {
            return await this.settingsService.get('site_name') || 'MindFourm';
        }
        catch {
            return 'MindFourm';
        }
    }
    async queueEmailIfEnabled(userId, emailType, templateVars) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user || !user.email)
            return;
        const preferenceKey = `${emailType}_email`;
        const enabled = user[preferenceKey] !== false;
        if (!enabled)
            return;
        const template = email_templates_1.EMAIL_TEMPLATES[emailType];
        const siteName = await this.getSiteName();
        await this.emailQueueService.addEmailJob({
            to: user.email,
            subject: templateVars.subject || `[${siteName}] 新通知`,
            html: this.renderEmailTemplate(template, {
                ...templateVars,
                username: user.username || '用户',
                site_name: siteName,
                preferences_url: `${this.frontendUrl}/settings`,
                year: new Date().getFullYear(),
            }),
        });
        this.emailLogRepository.save({
            user_id: userId,
            email_type: emailType,
            to_email: user.email,
            subject: templateVars.subject || `[${siteName}] 新通知`,
            status: 'sent',
        }).catch(() => { });
    }
    renderEmailTemplate(template, variables) {
        let html = template;
        for (const [key, value] of Object.entries(variables)) {
            html = html.replace(new RegExp(`{{${key}}}`, 'g'), String(value ?? ''));
        }
        return html;
    }
    async create(data) {
        const notification = this.notificationRepository.create({
            user_id: data.user_id,
            type: data.type,
            actor_id: data.actor_id,
            post_id: data.post_id,
            reply_id: data.reply_id,
            content: data.content,
            is_read: 0,
        });
        await this.notificationRepository.save(notification);
        await this.sendEmailForNotification(notification, data.actor_id);
        await this.redisService.del(`unread:${data.user_id}`);
        return notification;
    }
    async sendEmailForNotification(notification, actorId) {
        if (!actorId)
            return;
        try {
            const actor = await this.userRepository.findOne({ where: { id: actorId } });
            const actorName = actor?.username || '用户';
            switch (notification.type) {
                case 'reply': {
                    if (notification.post_id) {
                        const post = await this.postRepository.findOne({ where: { id: notification.post_id } });
                        if (post) {
                            await this.queueEmailIfEnabled(notification.user_id, 'reply', {
                                subject: `[${await this.getSiteName()}] 有人回复了你的帖子`,
                                username: '',
                                actor_name: actorName,
                                post_title: post.title,
                                post_url: `${this.frontendUrl}/posts/${post.id}`,
                                reply_excerpt: this.truncateHtml(notification.content || '', 200),
                            });
                        }
                    }
                    break;
                }
                case 'mention': {
                    if (notification.post_id) {
                        const post = await this.postRepository.findOne({ where: { id: notification.post_id } });
                        if (post) {
                            await this.queueEmailIfEnabled(notification.user_id, 'mention', {
                                subject: `[${await this.getSiteName()}] 有人提及了你`,
                                username: '',
                                actor_name: actorName,
                                post_title: post.title,
                                post_url: `${this.frontendUrl}/posts/${post.id}`,
                                mention_excerpt: this.truncateHtml(notification.content || '', 200),
                            });
                        }
                    }
                    break;
                }
                case 'system': {
                    await this.queueEmailIfEnabled(notification.user_id, 'system', {
                        subject: `[${await this.getSiteName()}] 系统通知`,
                        username: '',
                        title: '系统通知',
                        content: notification.content || '',
                    });
                    break;
                }
            }
        }
        catch (error) {
            console.error(`Failed to send email for notification ${notification.id}:`, error);
        }
    }
    truncateHtml(html, maxLength) {
        const plainText = html.replace(/<[^>]*>/g, '');
        if (plainText.length <= maxLength)
            return plainText;
        return plainText.substring(0, maxLength) + '...';
    }
    async notifyPostAuthor(postId, data) {
        const post = await this.postRepository.findOne({ where: { id: postId } });
        if (!post) {
            throw new common_1.NotFoundException(`Post with id ${postId} not found`);
        }
        if (post.user_id === data.actor_id) {
            return;
        }
        return this.create({
            user_id: post.user_id,
            type: data.type,
            actor_id: data.actor_id,
            post_id: postId,
            reply_id: data.reply_id,
            content: data.content,
        });
    }
    async notifyMentionedUsers(content, postId, actorId, replyId, skipUserIds = []) {
        const mentionRegex = /@(\w+)/g;
        const matches = [...content.matchAll(mentionRegex)];
        const usernames = [...new Set(matches.map((m) => m[1]))];
        if (usernames.length === 0) {
            return [];
        }
        const mentionedUsers = await this.userRepository.find({
            where: usernames.map((username) => ({ username })),
        });
        const notifications = [];
        skipUserIds.push(actorId);
        for (const user of mentionedUsers) {
            if (skipUserIds.includes(user.id)) {
                continue;
            }
            try {
                const notification = await this.create({
                    user_id: user.id,
                    type: 'mention',
                    actor_id: actorId,
                    post_id: postId,
                    reply_id: replyId,
                    content: `提到了你`,
                });
                notifications.push(notification);
            }
            catch (error) {
                console.error(`Failed to notify user ${user.id}:`, error);
            }
        }
        return notifications;
    }
    async getByUserId(userId, page = 1, limit = 20) {
        const [notifications, total] = await this.notificationRepository.findAndCount({
            where: { user_id: userId },
            relations: ['actor', 'post', 'reply'],
            order: { created_at: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return { notifications, total };
    }
    async getByUserIdCursor(userId, limit = 20, cursor) {
        const queryBuilder = this.notificationRepository
            .createQueryBuilder('notification')
            .leftJoinAndSelect('notification.actor', 'actor')
            .leftJoinAndSelect('notification.post', 'post')
            .leftJoinAndSelect('notification.reply', 'reply')
            .where('notification.user_id = :userId', { userId })
            .orderBy('notification.created_at', 'DESC')
            .addOrderBy('notification.id', 'DESC')
            .take(limit + 1);
        if (cursor) {
            const [timestamp, id] = cursor.split('_');
            queryBuilder.andWhere('(notification.created_at < :cursorTime OR (notification.created_at = :cursorTime AND notification.id < :cursorId))', { cursorTime: new Date(parseInt(timestamp)), cursorId: parseInt(id) });
        }
        const notifications = await queryBuilder.getMany();
        let nextCursor;
        if (notifications.length > limit) {
            const lastItem = notifications.pop();
            if (lastItem) {
                nextCursor = `${lastItem.created_at.getTime()}_${lastItem.id}`;
            }
        }
        return { notifications, nextCursor };
    }
    async getUnreadCount(userId) {
        const cacheKey = `unread:${userId}`;
        const cached = await this.redisService.get(cacheKey);
        if (cached !== null) {
            return parseInt(cached, 10);
        }
        const count = await this.notificationRepository.count({
            where: { user_id: userId, is_read: 0 },
        });
        await this.redisService.set(cacheKey, count.toString(), 300);
        return count;
    }
    async markAsRead(notificationId, userId) {
        const notification = await this.notificationRepository.findOne({
            where: { id: notificationId, user_id: userId },
        });
        if (!notification) {
            throw new common_1.NotFoundException('Notification not found');
        }
        notification.is_read = 1;
        await this.notificationRepository.save(notification);
        await this.redisService.del(`unread:${userId}`);
    }
    async markAllAsRead(userId) {
        await this.notificationRepository.update({ user_id: userId, is_read: 0 }, { is_read: 1 });
        await this.redisService.del(`unread:${userId}`);
    }
    async getEmailPreference(userId) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return {
            reply_email: user.reply_email,
            mention_email: user.mention_email,
            message_email: user.message_email,
            system_email: user.system_email,
            digest_email: user.digest_email,
        };
    }
    async updateEmailPreference(userId, dto) {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        if (dto.reply_email !== undefined)
            user.reply_email = dto.reply_email;
        if (dto.mention_email !== undefined)
            user.mention_email = dto.mention_email;
        if (dto.message_email !== undefined)
            user.message_email = dto.message_email;
        if (dto.system_email !== undefined)
            user.system_email = dto.system_email;
        if (dto.digest_email !== undefined)
            user.digest_email = dto.digest_email;
        await this.userRepository.save(user);
        return {
            reply_email: user.reply_email,
            mention_email: user.mention_email,
            message_email: user.message_email,
            system_email: user.system_email,
            digest_email: user.digest_email,
        };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(notification_entity_1.Notification)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(2, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __param(3, (0, typeorm_1.InjectRepository)(reply_entity_1.Reply)),
    __param(4, (0, typeorm_1.InjectRepository)(email_log_entity_1.EmailLog)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        redis_service_1.RedisService,
        email_queue_service_1.EmailQueueService,
        settings_service_1.SettingsService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map
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
exports.MessagesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const message_entity_1 = require("../../entities/message.entity");
const user_entity_1 = require("../../entities/user.entity");
const group_chat_entity_1 = require("../../entities/group-chat.entity");
const group_chat_member_entity_1 = require("../../entities/group-chat-member.entity");
const redis_service_1 = require("../../database/redis.service");
const markdown_util_1 = require("../../common/utils/markdown.util");
const notifications_service_1 = require("../notifications/notifications.service");
let MessagesService = class MessagesService {
    constructor(messageRepo, userRepo, groupChatRepo, groupChatMemberRepo, redisService, notificationsService, dataSource) {
        this.messageRepo = messageRepo;
        this.userRepo = userRepo;
        this.groupChatRepo = groupChatRepo;
        this.groupChatMemberRepo = groupChatMemberRepo;
        this.redisService = redisService;
        this.notificationsService = notificationsService;
        this.dataSource = dataSource;
    }
    async create(dto, senderId) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const recipient = await queryRunner.manager.findOne(user_entity_1.User, { where: { id: dto.recipient_id } });
            if (!recipient)
                throw new common_1.NotFoundException('Recipient not found');
            if (senderId === dto.recipient_id)
                throw new common_1.BadRequestException('Cannot send to yourself');
            const contentHtml = (0, markdown_util_1.parseMarkdown)(dto.content);
            const saved = await queryRunner.manager.save(message_entity_1.Message, {
                sender_id: senderId,
                recipient_id: dto.recipient_id,
                content: dto.content,
                content_html: contentHtml,
                is_read: 0,
                deleted_by_sender: 0,
                deleted_by_recipient: 0,
            });
            await this.notificationsService.create({
                user_id: dto.recipient_id,
                type: 'message',
                actor_id: senderId,
            });
            await this.redisService.del(`unread_msg:${dto.recipient_id}`);
            await queryRunner.commitTransaction();
            return saved;
        }
        catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        }
        finally {
            await queryRunner.release();
        }
    }
    async getConversations(userId, limit, cursor) {
        const conversations = await this.dataSource.query(`
      SELECT
        CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END as partner_id,
        u.username as partner_name,
        u.avatar_url as partner_avatar,
        MAX(m.created_at) as latest_at,
        SUM(CASE WHEN m.is_read = 0 AND m.recipient_id = ? THEN 1 ELSE 0 END) as unread,
        (SELECT content FROM messages m2
         WHERE (m2.sender_id = ? AND m2.recipient_id = cp.partner_id)
            OR (m2.sender_id = cp.partner_id AND m2.recipient_id = ?)
         ORDER BY m2.created_at DESC LIMIT 1) as last_message
      FROM messages m
      JOIN users u ON u.id = CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END
      CROSS JOIN (SELECT DISTINCT
        CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END as partner_id
        FROM messages WHERE sender_id = ? OR recipient_id = ?) cp
      WHERE (m.sender_id = ? OR m.recipient_id = ?)
        AND m.deleted_by_sender = 0 AND m.deleted_by_recipient = 0
      GROUP BY partner_id, u.username, u.avatar_url
      ORDER BY latest_at DESC LIMIT ?
    `, [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, limit + 1]);
        const hasMore = conversations.length > limit;
        if (hasMore)
            conversations.pop();
        return { conversations, nextCursor: hasMore && conversations.length ? conversations[conversations.length - 1].latest_at : null };
    }
    async getConversation(userId, otherUserId, limit, cursor) {
        const qb = this.messageRepo.createQueryBuilder('m')
            .where('(m.sender_id = :userId AND m.recipient_id = :otherId) OR (m.sender_id = :otherId AND m.recipient_id = :userId)', { userId, otherId: otherUserId })
            .andWhere('m.deleted_by_sender = 0 AND m.deleted_by_recipient = 0')
            .orderBy('m.created_at', 'DESC')
            .take(limit + 1);
        if (cursor)
            qb.andWhere('m.created_at < :cursor', { cursor });
        const messages = await qb.getMany();
        const hasMore = messages.length > limit;
        if (hasMore)
            messages.pop();
        const unreadIds = messages.filter((m) => m.recipient_id === userId && m.is_read === 0).map((m) => m.id);
        if (unreadIds.length > 0) {
            await this.messageRepo.update({ id: (0, typeorm_2.In)(unreadIds) }, { is_read: 1 });
            await this.decrementUnreadCount(userId, unreadIds.length);
        }
        return { messages: messages.reverse(), nextCursor: hasMore && messages.length ? messages[messages.length - 1].created_at.toISOString() : null };
    }
    async getUnreadCount(userId) {
        const cached = await this.redisService.get(`unread_msg:${userId}`);
        if (cached !== null)
            return parseInt(cached, 10);
        const count = await this.messageRepo.count({ where: { recipient_id: userId, is_read: 0, deleted_by_recipient: 0 } });
        await this.redisService.set(`unread_msg:${userId}`, count.toString(), 300);
        return count;
    }
    async deleteForUser(messageId, userId, isSender) {
        const message = await this.messageRepo.findOne({ where: { id: messageId } });
        if (!message)
            throw new common_1.NotFoundException('Message not found');
        if (isSender) {
            await this.messageRepo.update({ id: messageId }, { deleted_by_sender: 1 });
        }
        else {
            await this.messageRepo.update({ id: messageId }, { deleted_by_recipient: 1 });
        }
        const updated = await this.messageRepo.findOne({ where: { id: messageId } });
        if (updated?.deleted_by_sender === 1 && updated?.deleted_by_recipient === 1) {
            await this.messageRepo.delete(messageId);
        }
    }
    async decrementUnreadCount(userId, amount) {
        const key = `unread_msg:${userId}`;
        const current = await this.redisService.get(key);
        if (current !== null) {
            await this.redisService.set(key, String(Math.max(0, parseInt(current, 10) - amount)), 300);
        }
    }
    async createGroupChat(dto, creatorId) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const groupChat = queryRunner.manager.create(group_chat_entity_1.GroupChat, {
                name: dto.name,
                creator_id: creatorId,
                description: dto.description,
            });
            const saved = await queryRunner.manager.save(group_chat_entity_1.GroupChat, groupChat);
            const member = queryRunner.manager.create(group_chat_member_entity_1.GroupChatMember, {
                group_chat_id: saved.id,
                user_id: creatorId,
                role: 'admin',
            });
            await queryRunner.manager.save(group_chat_member_entity_1.GroupChatMember, member);
            await queryRunner.commitTransaction();
            return saved;
        }
        catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        }
        finally {
            await queryRunner.release();
        }
    }
    async getMyGroupChats(userId) {
        const memberships = await this.groupChatMemberRepo.find({
            where: { user_id: userId },
            relations: ['groupChat'],
            order: { joined_at: 'DESC' },
        });
        return memberships.map(m => m.groupChat);
    }
    async getGroupChat(groupId, userId) {
        const groupChat = await this.groupChatRepo.findOne({
            where: { id: groupId },
            relations: ['creator', 'members', 'members.user'],
        });
        if (!groupChat)
            throw new common_1.NotFoundException('群聊不存在');
        const isMember = groupChat.members.some(m => m.user_id === userId);
        if (!isMember)
            throw new common_1.ForbiddenException('你不是该群聊的成员');
        return groupChat;
    }
    async getGroupMessages(groupId, userId, limit = 50, cursor) {
        const member = await this.groupChatMemberRepo.findOne({
            where: { group_chat_id: groupId, user_id: userId },
        });
        if (!member)
            throw new common_1.ForbiddenException('你不是该群聊的成员');
        const cappedLimit = Math.min(limit, 100);
        const qb = this.messageRepo.createQueryBuilder('m')
            .where('m.group_chat_id = :groupId', { groupId })
            .leftJoinAndSelect('m.sender', 'sender')
            .orderBy('m.created_at', 'DESC')
            .take(cappedLimit + 1);
        if (cursor) {
            qb.andWhere('m.created_at < :cursor', { cursor });
        }
        const messages = await qb.getMany();
        const hasMore = messages.length > cappedLimit;
        if (hasMore)
            messages.pop();
        return { messages: messages.reverse(), nextCursor: hasMore && messages.length ? messages[messages.length - 1].created_at.toISOString() : null };
    }
    async sendGroupMessage(groupId, senderId, content) {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const member = await queryRunner.manager.findOne(group_chat_member_entity_1.GroupChatMember, {
                where: { group_chat_id: groupId, user_id: senderId },
            });
            if (!member)
                throw new common_1.ForbiddenException('你不是该群聊的成员');
            const groupChat = await queryRunner.manager.findOne(group_chat_entity_1.GroupChat, { where: { id: groupId } });
            if (!groupChat)
                throw new common_1.NotFoundException('群聊不存在');
            const contentHtml = (0, markdown_util_1.parseMarkdown)(content);
            const saved = await queryRunner.manager.save(message_entity_1.Message, {
                sender_id: senderId,
                group_chat_id: groupId,
                content,
                content_html: contentHtml,
                is_read: 0,
                deleted_by_sender: 0,
                deleted_by_recipient: 0,
            });
            await queryRunner.commitTransaction();
            return saved;
        }
        catch (e) {
            await queryRunner.rollbackTransaction();
            throw e;
        }
        finally {
            await queryRunner.release();
        }
    }
    async addGroupMember(groupId, userId, role = 'member') {
        const existing = await this.groupChatMemberRepo.findOne({
            where: { group_chat_id: groupId, user_id: userId },
        });
        if (existing)
            throw new common_1.BadRequestException('用户已在群聊中');
        const member = this.groupChatMemberRepo.create({
            group_chat_id: groupId,
            user_id: userId,
            role,
        });
        return this.groupChatMemberRepo.save(member);
    }
    async removeGroupMember(groupId, userId) {
        const result = await this.groupChatMemberRepo.delete({
            group_chat_id: groupId,
            user_id: userId,
        });
        if (result.affected === 0)
            throw new common_1.BadRequestException('用户未在群聊中');
    }
    async leaveGroupChat(groupId, userId) {
        const member = await this.groupChatMemberRepo.findOne({
            where: { group_chat_id: groupId, user_id: userId },
        });
        if (!member)
            throw new common_1.BadRequestException('你不是该群聊的成员');
        if (member.role === 'admin')
            throw new common_1.BadRequestException('群主不能离开群聊，请先转让或解散');
        await this.groupChatMemberRepo.delete({
            group_chat_id: groupId,
            user_id: userId,
        });
    }
    async updateGroupChat(groupId, userId, data) {
        const groupChat = await this.groupChatRepo.findOne({ where: { id: groupId } });
        if (!groupChat)
            throw new common_1.NotFoundException('群聊不存在');
        if (groupChat.creator_id !== userId)
            throw new common_1.ForbiddenException('只有群主可以修改群聊信息');
        if (data.name)
            groupChat.name = data.name;
        if (data.description !== undefined)
            groupChat.description = data.description;
        return this.groupChatRepo.save(groupChat);
    }
};
exports.MessagesService = MessagesService;
exports.MessagesService = MessagesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(message_entity_1.Message)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(2, (0, typeorm_1.InjectRepository)(group_chat_entity_1.GroupChat)),
    __param(3, (0, typeorm_1.InjectRepository)(group_chat_member_entity_1.GroupChatMember)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        redis_service_1.RedisService,
        notifications_service_1.NotificationsService,
        typeorm_2.DataSource])
], MessagesService);
//# sourceMappingURL=messages.service.js.map
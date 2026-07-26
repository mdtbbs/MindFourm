import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Message } from '@entities/message.entity';
import { User } from '@entities/user.entity';
import { GroupChat } from '@entities/group-chat.entity';
import { GroupChatMember } from '@entities/group-chat-member.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateGroupChatDto } from './dto/create-group-chat.dto';
import { RedisService } from '@database/redis.service';
import { parseMarkdown } from '@common/utils/markdown.util';
import { parseDateCursor, toDateCursor } from '@common/utils/date-cursor.util';
import { NotificationsService } from '../notifications/notifications.service';
import { UserBlocksService } from '../user-blocks/user-blocks.service';

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 100;

/**
 * Clamp a caller-supplied page size.
 *
 * `Number(query.limit)` was passed straight to `take()`, so `?limit=abc` produced
 * `LIMIT NaN` (a SQL error) and `?limit=999999` was honoured verbatim.
 */
export function normalizeMessageLimit(limit: unknown): number {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MESSAGE_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_MESSAGE_LIMIT);
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messageRepo: Repository<Message>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(GroupChat)
    private groupChatRepo: Repository<GroupChat>,
    @InjectRepository(GroupChatMember)
    private groupChatMemberRepo: Repository<GroupChatMember>,
    private redisService: RedisService,
    private notificationsService: NotificationsService,
    private userBlocksService: UserBlocksService,
    private dataSource: DataSource,
  ) {}

  async create(dto: CreateMessageDto, senderId: number): Promise<Message> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let saved: Message;
    try {
      const recipient = await queryRunner.manager.findOne(User, { where: { id: dto.recipient_id } });
      if (!recipient) throw new NotFoundException('Recipient not found');
      if (senderId === dto.recipient_id) throw new BadRequestException('Cannot send to yourself');
      // Checked before the write, not in the client: the block is invisible to the
      // sender, so hiding the compose box would still leave this endpoint reachable.
      await this.userBlocksService.assertNotBlocked(senderId, dto.recipient_id);

      const contentHtml = parseMarkdown(dto.content);
      saved = await queryRunner.manager.save(Message, {
        sender_id: senderId,
        recipient_id: dto.recipient_id,
        content: dto.content,
        content_html: contentHtml,
        is_read: 0,
        deleted_by_sender: 0,
        deleted_by_recipient: 0,
      });

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    // Neither of these can join this transaction — the notification is written on a
    // pooled connection of its own, and Redis has no transaction at all — so they
    // run only once the message is durably committed. Inside the transaction, a
    // rollback still left the recipient with a notification and an invalidated
    // unread cache for a message that was never stored.
    await this.notificationsService.create({
      user_id: dto.recipient_id,
      type: 'message',
      actor_id: senderId,
    }).catch((err) => console.error('Message notification error:', err));
    await this.redisService.del(`unread_msg:${dto.recipient_id}`);

    return saved;
  }

  /**
   * Conversation list, newest activity first.
   *
   * Keyset pagination walks backwards through `latest_at`; the previous version
   * accepted a `cursor` argument, ignored it, and still returned a `nextCursor` —
   * so every "load more" re-fetched page one.
   */
  async getConversations(userId: number, limit: unknown, cursor?: string) {
    const cappedLimit = normalizeMessageLimit(limit);
    const cursorClause = cursor ? 'HAVING latest_at < ?' : '';
    const params: unknown[] = [
      userId, userId, userId, userId, userId, userId, userId, userId, userId, userId,
    ];
    if (cursor) params.push(parseDateCursor(cursor));
    params.push(cappedLimit + 1);

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
      ${cursorClause}
      ORDER BY latest_at DESC LIMIT ?
    `, params);

    const hasMore = conversations.length > cappedLimit;
    if (hasMore) conversations.pop();

    const oldest = conversations.length ? conversations[conversations.length - 1] : null;
    return {
      conversations,
      nextCursor: hasMore && oldest ? toDateCursor(oldest.latest_at) : null,
    };
  }

  async getConversation(userId: number, otherUserId: number, limit: unknown, cursor?: string) {
    const cappedLimit = normalizeMessageLimit(limit);
    const qb = this.messageRepo.createQueryBuilder('m')
      .where('(m.sender_id = :userId AND m.recipient_id = :otherId) OR (m.sender_id = :otherId AND m.recipient_id = :userId)',
        { userId, otherId: otherUserId })
      .andWhere('m.deleted_by_sender = 0 AND m.deleted_by_recipient = 0')
      .orderBy('m.created_at', 'DESC')
      .take(cappedLimit + 1);

    if (cursor) qb.andWhere('m.created_at < :cursor', { cursor: parseDateCursor(cursor) });

    const messages = await qb.getMany();
    const hasMore = messages.length > cappedLimit;
    if (hasMore) messages.pop();

    // Mark as read
    const unreadIds = messages.filter((m) => m.recipient_id === userId && m.is_read === 0).map((m) => m.id);
    if (unreadIds.length > 0) {
      await this.messageRepo.update({ id: In(unreadIds) }, { is_read: 1 });
      await this.decrementUnreadCount(userId, unreadIds.length);
    }

    // Oldest row of this newest-first page, captured before reversing for display.
    const oldest = messages.length ? messages[messages.length - 1] : null;
    const nextCursor = hasMore && oldest ? toDateCursor(oldest.created_at) : null;

    return { messages: messages.reverse(), nextCursor };
  }

  async getUnreadCount(userId: number): Promise<number> {
    const cached = await this.redisService.get(`unread_msg:${userId}`);
    if (cached !== null) return parseInt(cached, 10);
    const count = await this.messageRepo.count({ where: { recipient_id: userId, is_read: 0, deleted_by_recipient: 0 } });
    await this.redisService.set(`unread_msg:${userId}`, count.toString(), 300);
    return count;
  }

  /**
   * Hide a direct message for one side of the conversation.
   *
   * Which side is derived from the message itself: the caller used to pass a
   * hard-coded `isSender = false` and no ownership was checked at all, so any
   * authenticated user could flag any message by id — and once both flags were
   * set the row was hard-deleted for both parties.
   */
  async deleteForUser(messageId: number, userId: number): Promise<void> {
    const message = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');

    const isSender = message.sender_id === userId;
    const isRecipient = message.recipient_id === userId;
    if (!isSender && !isRecipient) {
      throw new ForbiddenException('无权删除该消息');
    }

    await this.messageRepo.update(
      { id: messageId },
      isSender ? { deleted_by_sender: 1 } : { deleted_by_recipient: 1 },
    );

    // Check if both deleted
    const updated = await this.messageRepo.findOne({ where: { id: messageId } });
    if (updated?.deleted_by_sender === 1 && updated?.deleted_by_recipient === 1) {
      await this.messageRepo.delete(messageId);
    }
  }

  private async decrementUnreadCount(userId: number, amount: number): Promise<void> {
    const key = `unread_msg:${userId}`;
    const current = await this.redisService.get(key);
    if (current !== null) {
      await this.redisService.set(key, String(Math.max(0, parseInt(current, 10) - amount)), 300);
    }
  }

  // === Group Chat ===

  async createGroupChat(dto: CreateGroupChatDto, creatorId: number): Promise<GroupChat> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const groupChat = queryRunner.manager.create(GroupChat, {
        name: dto.name,
        creator_id: creatorId,
        description: dto.description,
      });
      const saved = await queryRunner.manager.save(GroupChat, groupChat);

      // Add creator as admin
      const member = queryRunner.manager.create(GroupChatMember, {
        group_chat_id: saved.id,
        user_id: creatorId,
        role: 'admin',
      });
      await queryRunner.manager.save(GroupChatMember, member);

      await queryRunner.commitTransaction();
      return saved;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async getMyGroupChats(userId: number): Promise<GroupChat[]> {
    const memberships = await this.groupChatMemberRepo.find({
      where: { user_id: userId },
      relations: ['groupChat'],
      order: { joined_at: 'DESC' },
    });
    return memberships.map(m => m.groupChat);
  }

  async getGroupChat(groupId: number, userId: number): Promise<GroupChat> {
    const groupChat = await this.groupChatRepo.findOne({
      where: { id: groupId },
      relations: ['creator', 'members', 'members.user'],
    });
    if (!groupChat) throw new NotFoundException('群聊不存在');

    // Check membership
    const isMember = groupChat.members.some(m => m.user_id === userId);
    if (!isMember) throw new ForbiddenException('你不是该群聊的成员');

    return groupChat;
  }

  async getGroupMessages(groupId: number, userId: number, limit: unknown = 50, cursor?: string) {
    // Check membership first
    const member = await this.findGroupMembership(groupId, userId);
    if (!member) throw new ForbiddenException('你不是该群聊的成员');

    const cappedLimit = normalizeMessageLimit(limit);

    const qb = this.messageRepo.createQueryBuilder('m')
      .where('m.group_chat_id = :groupId', { groupId })
      .leftJoinAndSelect('m.sender', 'sender')
      .orderBy('m.created_at', 'DESC')
      .take(cappedLimit + 1);

    if (cursor) {
      qb.andWhere('m.created_at < :cursor', { cursor: parseDateCursor(cursor) });
    }

    const messages = await qb.getMany();
    const hasMore = messages.length > cappedLimit;
    if (hasMore) messages.pop();

    // The query is newest-first, so the oldest row of this page is the last one —
    // read it *before* reversing for display. Reversing first (as this used to do)
    // yielded the newest timestamp instead, so the next page repeated this one
    // forever.
    const oldest = messages.length ? messages[messages.length - 1] : null;
    const nextCursor = hasMore && oldest ? toDateCursor(oldest.created_at) : null;

    return { messages: messages.reverse(), nextCursor };
  }

  async sendGroupMessage(groupId: number, senderId: number, content: string): Promise<Message> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Check membership
      const member = await queryRunner.manager.findOne(GroupChatMember, {
        where: { group_chat_id: groupId, user_id: senderId },
      });
      if (!member) throw new ForbiddenException('你不是该群聊的成员');

      const groupChat = await queryRunner.manager.findOne(GroupChat, { where: { id: groupId } });
      if (!groupChat) throw new NotFoundException('群聊不存在');

      const contentHtml = parseMarkdown(content);
      const saved = await queryRunner.manager.save(Message, {
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
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Membership of a group chat, or null. Used to authorise every group operation.
   */
  private async findGroupMembership(
    groupId: number,
    userId: number,
  ): Promise<GroupChatMember | null> {
    return this.groupChatMemberRepo.findOne({
      where: { group_chat_id: groupId, user_id: userId },
    });
  }

  /**
   * Assert the caller administers the group chat.
   *
   * Without this, `addGroupMember` let anyone join any group as `admin` and then
   * read its entire history, and `removeGroupMember` let anyone kick anyone.
   */
  private async assertGroupAdmin(groupId: number, actorId: number): Promise<void> {
    const membership = await this.findGroupMembership(groupId, actorId);
    if (!membership) throw new ForbiddenException('你不是该群聊的成员');
    if (membership.role !== 'admin') throw new ForbiddenException('只有群管理员可以管理成员');
  }

  async addGroupMember(
    groupId: number,
    actorId: number,
    userId: number,
    role: string = 'member',
  ): Promise<GroupChatMember> {
    await this.assertGroupAdmin(groupId, actorId);

    if (role !== 'member' && role !== 'admin') {
      throw new BadRequestException('无效的成员角色');
    }

    const existing = await this.findGroupMembership(groupId, userId);
    if (existing) throw new BadRequestException('用户已在群聊中');

    const member = this.groupChatMemberRepo.create({
      group_chat_id: groupId,
      user_id: userId,
      role,
    });
    return this.groupChatMemberRepo.save(member);
  }

  async removeGroupMember(groupId: number, actorId: number, userId: number): Promise<void> {
    await this.assertGroupAdmin(groupId, actorId);

    if (userId === actorId) {
      throw new BadRequestException('群管理员请使用退出群聊或转让群主');
    }

    const result = await this.groupChatMemberRepo.delete({
      group_chat_id: groupId,
      user_id: userId,
    });
    if (result.affected === 0) throw new BadRequestException('用户未在群聊中');
  }

  async leaveGroupChat(groupId: number, userId: number): Promise<void> {
    const member = await this.groupChatMemberRepo.findOne({
      where: { group_chat_id: groupId, user_id: userId },
    });
    if (!member) throw new BadRequestException('你不是该群聊的成员');
    if (member.role === 'admin') throw new BadRequestException('群主不能离开群聊，请先转让或解散');

    await this.groupChatMemberRepo.delete({
      group_chat_id: groupId,
      user_id: userId,
    });
  }

  async updateGroupChat(groupId: number, userId: number, data: { name?: string; description?: string }): Promise<GroupChat> {
    const groupChat = await this.groupChatRepo.findOne({ where: { id: groupId } });
    if (!groupChat) throw new NotFoundException('群聊不存在');
    if (groupChat.creator_id !== userId) throw new ForbiddenException('只有群主可以修改群聊信息');

    if (data.name) groupChat.name = data.name;
    if (data.description !== undefined) groupChat.description = data.description;

    return this.groupChatRepo.save(groupChat);
  }
}

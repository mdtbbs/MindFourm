import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { RedisService } from '../../database/redis.service';
import { NotificationReadFilter } from './dto/query-notifications.dto';
import { escapeHtml } from '../../common/utils/escape-html.util';
import { Notification } from '../../entities/notification.entity';
import { User } from '../../entities/user.entity';
import { Post } from '../../entities/post.entity';
import { Reply } from '../../entities/reply.entity';
import { EmailLog } from '../../entities/email-log.entity';
import { EmailQueueService } from './email-queue.service';
import { EMAIL_TEMPLATES } from './email.templates';
import { SettingsService } from '../settings/settings.service';
import { NotificationStreamService } from './notification-stream.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private frontendUrl: string = process.env.FRONTEND_URL || 'http://localhost:3000';

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(Reply)
    private replyRepository: Repository<Reply>,
    @InjectRepository(EmailLog)
    private emailLogRepository: Repository<EmailLog>,
    private redisService: RedisService,
    private emailQueueService: EmailQueueService,
    private settingsService: SettingsService,
    private notificationStream: NotificationStreamService,
  ) {}

  /**
   * Get the site name from settings, with fallback
   */
  private async getSiteName(): Promise<string> {
    try {
      return await this.settingsService.get('site_name') || 'MindFourm';
    } catch {
      return 'MindFourm';
    }
  }

  /**
   * Queue an email notification with user preference check
   */
  private async queueEmailIfEnabled(
    userId: number,
    emailType: 'reply' | 'mention' | 'message' | 'system',
    templateVars: Record<string, any>,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.email) return;

    // Check user's email preference
    const preferenceKey = `${emailType}_email` as keyof User;
    const enabled = user[preferenceKey] !== false;
    if (!enabled) return;

    const template = EMAIL_TEMPLATES[emailType];
    const siteName = await this.getSiteName();
    const subject = this.sanitizeHeaderValue(
      templateVars.subject || `[${siteName}] 新通知`,
    );

    await this.emailQueueService.addEmailJob({
      to: user.email,
      subject,
      html: this.renderEmailTemplate(template, {
        ...templateVars,
        username: user.username || '用户',
        site_name: siteName,
        preferences_url: `${this.frontendUrl}/settings`,
        year: new Date().getFullYear(),
      }),
    });

    // Records the attempt, not a confirmed delivery: the BullMQ worker has not run
    // yet at this point. Status is reconciled when the job completes.
    this.emailLogRepository.save({
      user_id: userId,
      email_type: emailType,
      to_email: user.email,
      subject,
      status: 'queued',
    }).catch((error) => {
      this.logger.warn(`Failed to record email log: ${(error as Error).message}`);
    });
  }

  /**
   * Simple template rendering (replaces {{key}} with value).
   *
   * Values are HTML-escaped. Several of them — `actor_name` in particular — come
   * from MindAuth-controlled usernames and post titles, and were substituted raw
   * into the message body.
   */
  private renderEmailTemplate(template: string, variables: Record<string, any>): string {
    let html = template;
    for (const [key, value] of Object.entries(variables)) {
      // Replacement is a function so `$&`, `$1` and friends in user content are not
      // interpreted as replacement patterns.
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), () => escapeHtml(String(value ?? '')));
    }
    return html;
  }

  /**
   * Strip characters that would let a value break out of the Subject header.
   *
   * `actor_name` is interpolated into the subject line, and a CR/LF there splits the
   * header and injects arbitrary ones.
   */
  private sanitizeHeaderValue(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  }

  async create(data: {
    user_id: number;
    type: string;
    actor_id?: number;
    post_id?: number;
    reply_id?: number;
    content?: string;
  }): Promise<Notification> {
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

    // Send email notification based on type
    await this.sendEmailForNotification(notification, data.actor_id);

    // Invalidate unread count cache
    await this.redisService.del(`unread:${data.user_id}`);

    // Push to user's SSE stream for real-time delivery
    await this.pushToSse(notification.id);

    return notification;
  }

  /**
   * Send email notification based on notification type
   */
  private async sendEmailForNotification(notification: Notification, actorId?: number): Promise<void> {
    if (!actorId) return;

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
                username: '', // Will be filled from user lookup in queueEmailIfEnabled
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
        case 'message': {
          await this.queueEmailIfEnabled(notification.user_id, 'message', {
            subject: `[${await this.getSiteName()}] ${actorName} 给你发了私信`,
            username: '',
            actor_name: actorName,
            message_excerpt: this.truncateHtml(notification.content || '', 200),
            message_url: `${this.frontendUrl}/messages`,
          });
          break;
        }
        // 'like' and 'report' types don't send emails by design
      }
    } catch (error) {
      // Don't let email failures block notification creation
      console.error(`Failed to send email for notification ${notification.id}:`, error);
    }
  }

  /**
   * Truncate HTML content for email excerpts
   */
  private truncateHtml(html: string, maxLength: number): string {
    // Strip HTML tags for plain text excerpt
    const plainText = html.replace(/<[^>]*>/g, '');
    if (plainText.length <= maxLength) return plainText;
    return plainText.substring(0, maxLength) + '...';
  }

  /**
   * Load full notification (with actor/post) and push to SSE stream
   */
  private async pushToSse(notificationId: number): Promise<void> {
    try {
      const full = await this.notificationRepository.findOne({
        where: { id: notificationId },
        relations: ['actor', 'post'],
      });
      if (!full) return;

      const payload = {
        id: full.id,
        user_id: full.user_id,
        type: full.type,
        actor_id: full.actor_id,
        actor_name: full.actor?.username || '用户',
        post_id: full.post_id,
        post_title: full.post?.title || null,
        reply_id: full.reply_id,
        content: full.content,
        is_read: full.is_read,
        created_at: full.created_at,
      };

      this.notificationStream.push(full.user_id, payload);
    } catch (err) {
      // Don't let SSE push failures block notification creation
      console.error(`Failed to push SSE notification ${notificationId}:`, err);
    }
  }

  async notifyPostAuthor(
    postId: number,
    data: {
      type: string;
      actor_id: number;
      reply_id?: number;
      content?: string;
    },
  ): Promise<Notification | undefined> {
    const post = await this.postRepository.findOne({ where: { id: postId } });

    if (!post) {
      throw new NotFoundException(`Post with id ${postId} not found`);
    }

    // Don't notify the author if they are the actor
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

  async notifyMentionedUsers(
    content: string,
    postId: number,
    actorId: number,
    replyId?: number,
    skipUserIds: number[] = [],
  ): Promise<Notification[]> {
    // Parse @username mentions using regex
    const mentionRegex = /@(\w+)/g;
    const matches = [...content.matchAll(mentionRegex)];
    const usernames = [...new Set(matches.map((m) => m[1]))];

    if (usernames.length === 0) {
      return [];
    }

    // Find users by username
    const mentionedUsers = await this.userRepository.find({
      where: usernames.map((username) => ({ username })),
    });

    const notifications: Notification[] = [];
    skipUserIds.push(actorId);

    for (const user of mentionedUsers) {
      // Skip if in skipUserIds or is the actor
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
      } catch (error) {
        // Continue processing other mentions even if one fails
        console.error(`Failed to notify user ${user.id}:`, error);
      }
    }

    return notifications;
  }

  async getByUserId(
    userId: number,
    page: number = 1,
    limit: number = 20,
    filter: NotificationReadFilter = 'all',
  ): Promise<{ notifications: Notification[]; total: number }> {
    // The read filter belongs in the WHERE clause so that `total` — and therefore the
    // page count the client renders — describes the same rows being returned. Filtering
    // one fetched page in the browser instead made "unread only" show an empty list
    // whenever the unread items sat beyond page one.
    const where: FindOptionsWhere<Notification> = { user_id: userId };
    if (filter === 'unread') where.is_read = 0;
    if (filter === 'read') where.is_read = 1;

    const [notifications, total] = await this.notificationRepository.findAndCount({
      where,
      relations: ['actor', 'post', 'reply'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { notifications, total };
  }

  async getByUserIdCursor(
    userId: number,
    limit: number = 20,
    cursor?: string,
  ): Promise<{ notifications: Notification[]; nextCursor?: string }> {
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
      // Cursor format: timestamp_id
      const [timestamp, id] = cursor.split('_');
      queryBuilder.andWhere(
        '(notification.created_at < :cursorTime OR (notification.created_at = :cursorTime AND notification.id < :cursorId))',
        { cursorTime: new Date(parseInt(timestamp)), cursorId: parseInt(id) },
      );
    }

    const notifications = await queryBuilder.getMany();

    let nextCursor: string | undefined;
    if (notifications.length > limit) {
      const lastItem = notifications.pop();
      if (lastItem) {
        nextCursor = `${lastItem.created_at.getTime()}_${lastItem.id}`;
      }
    }

    return { notifications, nextCursor };
  }

  async getUnreadCount(userId: number): Promise<number> {
    const cacheKey = `unread:${userId}`;

    // Try cache first
    const cached = await this.redisService.get(cacheKey);
    if (cached !== null) {
      return parseInt(cached, 10);
    }

    // Query from database
    const count = await this.notificationRepository.count({
      where: { user_id: userId, is_read: 0 },
    });

    // Cache for 5 minutes
    await this.redisService.set(cacheKey, count.toString(), 300);

    return count;
  }

  async markAsRead(notificationId: number, userId: number): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, user_id: userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.is_read = 1;
    await this.notificationRepository.save(notification);

    // Invalidate unread count cache
    await this.redisService.del(`unread:${userId}`);
  }

  async markAllAsRead(userId: number): Promise<void> {
    await this.notificationRepository.update(
      { user_id: userId, is_read: 0 },
      { is_read: 1 },
    );

    // Invalidate unread count cache
    await this.redisService.del(`unread:${userId}`);
  }

  /**
   * Get user's email notification preferences
   */
  async getEmailPreference(userId: number): Promise<{
    reply_email: boolean;
    mention_email: boolean;
    message_email: boolean;
    system_email: boolean;
    digest_email: boolean;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      reply_email: user.reply_email,
      mention_email: user.mention_email,
      message_email: user.message_email,
      system_email: user.system_email,
      digest_email: user.digest_email,
    };
  }

  /**
   * Update user's email notification preferences
   */
  async updateEmailPreference(
    userId: number,
    dto: {
      reply_email?: boolean;
      mention_email?: boolean;
      message_email?: boolean;
      system_email?: boolean;
      digest_email?: boolean;
    },
  ): Promise<{
    reply_email: boolean;
    mention_email: boolean;
    message_email: boolean;
    system_email: boolean;
    digest_email: boolean;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update only provided fields
    if (dto.reply_email !== undefined) user.reply_email = dto.reply_email;
    if (dto.mention_email !== undefined) user.mention_email = dto.mention_email;
    if (dto.message_email !== undefined) user.message_email = dto.message_email;
    if (dto.system_email !== undefined) user.system_email = dto.system_email;
    if (dto.digest_email !== undefined) user.digest_email = dto.digest_email;

    await this.userRepository.save(user);

    return {
      reply_email: user.reply_email,
      mention_email: user.mention_email,
      message_email: user.message_email,
      system_email: user.system_email,
      digest_email: user.digest_email,
    };
  }
}

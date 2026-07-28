import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { RedisService } from '../../database/redis.service';
import { NotificationReadFilter } from './dto/query-notifications.dto';
import { parseMarkdown } from '../../common/utils/markdown.util';
import { Notification } from '../../entities/notification.entity';
import { User } from '../../entities/user.entity';
import { Post } from '../../entities/post.entity';
import { Reply } from '../../entities/reply.entity';
import { EmailLog } from '../../entities/email-log.entity';
import { EmailQueueService } from './email-queue.service';
import {
  DEFAULT_WELCOME_NOTIFICATION_BODY,
  DEFAULT_WELCOME_NOTIFICATION_TITLE,
  EMAIL_LAYOUT_TEMPLATE,
  EMAIL_TEMPLATE_DEFAULTS,
  type EmailTemplateEventKey,
} from './email.templates';
import { SettingsService } from '../settings/settings.service';
import { NotificationStreamService } from './notification-stream.service';
import { TemplateService } from './template.service';

export interface NotificationView {
  id: number;
  user_id: number;
  type: string;
  actor_id: number | null;
  actor_name: string | null;
  actor_avatar: string | null;
  post_id: number | null;
  post_title: string | null;
  reply_id: number | null;
  content: string | null;
  is_read: boolean;
  created_at: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly fallbackFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

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
    private templateService: TemplateService,
  ) {}

  /**
   * Get the site name from settings, with fallback.
   */
  private async getSiteName(): Promise<string> {
    try {
      return await this.settingsService.get('site_name') || 'MindFourm';
    } catch {
      return 'MindFourm';
    }
  }

  /**
   * Use the configured public site URL when available so notification links follow
   * branding/domain changes instead of staying pinned to the initial env default.
   */
  private async getFrontendUrl(): Promise<string> {
    try {
      const configured = await this.settingsService.get('site_url');
      return configured?.trim() || this.fallbackFrontendUrl;
    } catch {
      return this.fallbackFrontendUrl;
    }
  }

  private isEnabled(value: string | null | undefined, defaultValue: boolean): boolean {
    if (value == null) {
      return defaultValue;
    }
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }

  private getDefaultActionLabel(eventKey: EmailTemplateEventKey): string {
    switch (eventKey) {
      case 'reply':
        return '查看完整回复';
      case 'mention':
        return '查看上下文';
      case 'message':
        return '查看私信';
      case 'welcome':
        return '进入社区';
      case 'system':
      default:
        return '前往查看';
    }
  }

  /**
   * Strip characters that would let a value break out of the Subject header.
   */
  private sanitizeHeaderValue(value: string): string {
    return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  }

  private truncateContent(content: string, maxLength: number): string {
    const plainText = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (plainText.length <= maxLength) {
      return plainText;
    }
    return `${plainText.slice(0, maxLength)}...`;
  }

  private truncateErrorMessage(message: string, maxLength: number = 1000): string {
    return message.length > maxLength ? `${message.slice(0, maxLength - 3)}...` : message;
  }

  private composeMarkdownMessage(title: string, body: string): string {
    const sections = [
      title.trim() ? `# ${title.trim()}` : '',
      body.trim(),
    ].filter(Boolean);

    return sections.join('\n\n').trim();
  }

  private normalizeNotification(notification: Notification): NotificationView {
    return {
      id: notification.id,
      user_id: notification.user_id,
      type: notification.type,
      actor_id: notification.actor_id ?? null,
      actor_name: notification.actor?.username ?? null,
      actor_avatar: notification.actor?.avatar_url ?? null,
      post_id: notification.post_id ?? null,
      post_title: notification.post?.title ?? null,
      reply_id: notification.reply_id ?? null,
      content: notification.content ?? null,
      is_read: notification.is_read === 1,
      created_at: notification.created_at.toISOString(),
    };
  }

  private async renderWelcomeContent(user: User): Promise<string> {
    const emailSettings = await this.settingsService.getByCategory('email');
    const siteName = await this.getSiteName();
    const variables = {
      username: user.username || '用户',
      site_name: siteName,
    };

    const titleTemplate = emailSettings.welcome_notification_title || DEFAULT_WELCOME_NOTIFICATION_TITLE;
    const bodyTemplate = emailSettings.welcome_notification_body || DEFAULT_WELCOME_NOTIFICATION_BODY;
    const title = this.templateService.render(titleTemplate, variables);
    const body = this.templateService.render(bodyTemplate, variables);

    return this.composeMarkdownMessage(title, body);
  }

  /**
   * Queue an email notification with per-user preference, per-event toggle and
   * admin-configurable Markdown templates.
   */
  private async queueEmailIfEnabled(
    userId: number,
    emailType: EmailTemplateEventKey,
    templateVars: Record<string, unknown>,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.email) return;

    const templateConfig = EMAIL_TEMPLATE_DEFAULTS[emailType];
    const userPreferenceEnabled = user[templateConfig.preferenceKey] !== false;
    if (!userPreferenceEnabled) return;

    const emailSettings = await this.settingsService.getByCategory('email');
    if (!this.isEnabled(emailSettings[templateConfig.enabledSettingKey], templateConfig.defaultEnabled)) {
      return;
    }

    const siteName = await this.getSiteName();
    const frontendUrl = await this.getFrontendUrl();
    const actionUrl = typeof templateVars.action_url === 'string' ? templateVars.action_url : undefined;
    const actionLabel = typeof templateVars.action_label === 'string'
      ? templateVars.action_label
      : actionUrl
        ? this.getDefaultActionLabel(emailType)
        : undefined;

    const variables = {
      ...templateVars,
      action_url: actionUrl,
      action_label: actionLabel,
      username: user.username || '用户',
      site_name: siteName,
      preferences_url: `${frontendUrl}/settings`,
      year: new Date().getFullYear(),
    };

    const subjectTemplate = emailSettings[templateConfig.subjectSettingKey] || templateConfig.defaultSubject;
    const bodyTemplate = emailSettings[templateConfig.bodySettingKey] || templateConfig.defaultBody;
    const subject = this.sanitizeHeaderValue(this.templateService.render(subjectTemplate, variables));
    const contentMarkdown = this.templateService.render(bodyTemplate, variables);
    const html = this.templateService.render(EMAIL_LAYOUT_TEMPLATE, {
      ...variables,
      content_html: parseMarkdown(contentMarkdown),
    });

    const emailLog = await this.emailLogRepository.save({
      user_id: userId,
      email_type: emailType,
      to_email: user.email,
      subject,
      status: 'queued',
    });

    try {
      await this.emailQueueService.addEmailJob({
        to: user.email,
        subject,
        html,
        logId: emailLog.id,
      });
    } catch (error) {
      await this.emailLogRepository.update(emailLog.id, {
        status: 'failed',
        error_message: this.truncateErrorMessage((error as Error).message),
      }).catch((updateError) => {
        this.logger.warn(`Failed to update email log ${emailLog.id}: ${(updateError as Error).message}`);
      });
      throw error;
    }
  }

  async create(data: {
    user_id: number;
    type: string;
    actor_id?: number;
    post_id?: number;
    reply_id?: number;
    content?: string;
    emailEvent?: EmailTemplateEventKey | false;
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

    if (data.emailEvent !== false) {
      await this.sendEmailForNotification(notification, data.actor_id, data.emailEvent);
    }

    // Invalidate unread count cache
    await this.redisService.del(`unread:${data.user_id}`);

    // Push to user's SSE stream for real-time delivery
    await this.pushToSse(notification.id);

    return notification;
  }

  async sendWelcomeNotification(userId: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return;
    }

    const content = await this.renderWelcomeContent(user);
    const frontendUrl = await this.getFrontendUrl();

    if (await this.settingsService.getBoolean('welcome_notification_enabled', true)) {
      await this.create({
        user_id: userId,
        type: 'system',
        content,
        emailEvent: false,
      });
    }

    await this.queueEmailIfEnabled(userId, 'welcome', {
      content,
      action_url: frontendUrl,
    });
  }

  /**
   * Send email notification based on notification type.
   */
  private async sendEmailForNotification(
    notification: Notification,
    actorId?: number,
    emailEventOverride?: EmailTemplateEventKey,
  ): Promise<void> {
    try {
      const actor = actorId
        ? await this.userRepository.findOne({ where: { id: actorId } })
        : null;
      const actorName = actor?.username || '用户';
      const frontendUrl = await this.getFrontendUrl();
      const emailEvent = emailEventOverride || (() => {
        switch (notification.type) {
          case 'reply':
          case 'mention':
          case 'message':
          case 'system':
            return notification.type;
          default:
            return null;
        }
      })();

      if (!emailEvent) {
        return;
      }

      switch (emailEvent) {
        case 'reply': {
          if (notification.post_id) {
            const post = await this.postRepository.findOne({ where: { id: notification.post_id } });
            if (post) {
              await this.queueEmailIfEnabled(notification.user_id, 'reply', {
                actor_name: actorName,
                post_title: post.title,
                post_url: `${frontendUrl}/posts/${post.id}`,
                reply_excerpt: this.truncateContent(notification.content || '', 200),
                action_url: `${frontendUrl}/posts/${post.id}`,
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
                actor_name: actorName,
                post_title: post.title,
                post_url: `${frontendUrl}/posts/${post.id}`,
                mention_excerpt: this.truncateContent(notification.content || '', 200),
                action_url: `${frontendUrl}/posts/${post.id}`,
              });
            }
          }
          break;
        }
        case 'system': {
          await this.queueEmailIfEnabled(notification.user_id, 'system', {
            content: notification.content || '',
          });
          break;
        }
        case 'message': {
          await this.queueEmailIfEnabled(notification.user_id, 'message', {
            sender_name: actorName,
            message_excerpt: this.truncateContent(notification.content || '', 200),
            message_url: `${frontendUrl}/messages`,
            action_url: `${frontendUrl}/messages`,
          });
          break;
        }
        default:
          break;
      }
    } catch (error) {
      // Don't let email failures block notification creation.
      this.logger.warn(`Failed to send email for notification ${notification.id}: ${(error as Error).message}`);
    }
  }

  /**
   * Load full notification (with actor/post) and push to SSE stream.
   */
  private async pushToSse(notificationId: number): Promise<void> {
    try {
      const full = await this.notificationRepository.findOne({
        where: { id: notificationId },
        relations: ['actor', 'post'],
      });
      if (!full) return;

      this.notificationStream.push(full.user_id, this.normalizeNotification(full));
    } catch (err) {
      // Don't let SSE push failures block notification creation.
      this.logger.warn(`Failed to push SSE notification ${notificationId}: ${(err as Error).message}`);
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

    // Don't notify the author if they are the actor.
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
    // Parse @username mentions using regex.
    const mentionRegex = /@(\w+)/g;
    const matches = [...content.matchAll(mentionRegex)];
    const usernames = [...new Set(matches.map((m) => m[1]))];

    if (usernames.length === 0) {
      return [];
    }

    const mentionedUsers = await this.userRepository.find({
      where: usernames.map((username) => ({ username })),
    });

    const notifications: Notification[] = [];
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
          content,
        });
        notifications.push(notification);
      } catch (error) {
        // Continue processing other mentions even if one fails.
        this.logger.warn(`Failed to notify user ${user.id}: ${(error as Error).message}`);
      }
    }

    return notifications;
  }

  async getByUserId(
    userId: number,
    page: number = 1,
    limit: number = 20,
    filter: NotificationReadFilter = 'all',
  ): Promise<{ notifications: NotificationView[]; total: number }> {
    // The read filter belongs in the WHERE clause so that `total` — and therefore the
    // page count the client renders — describes the same rows being returned.
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

    return {
      notifications: notifications.map((item) => this.normalizeNotification(item)),
      total,
    };
  }

  async getByUserIdCursor(
    userId: number,
    limit: number = 20,
    cursor?: string,
  ): Promise<{ notifications: NotificationView[]; nextCursor?: string }> {
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
      queryBuilder.andWhere(
        '(notification.created_at < :cursorTime OR (notification.created_at = :cursorTime AND notification.id < :cursorId))',
        { cursorTime: new Date(parseInt(timestamp, 10)), cursorId: parseInt(id, 10) },
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

    return {
      notifications: notifications.map((item) => this.normalizeNotification(item)),
      nextCursor,
    };
  }

  async getUnreadCount(userId: number): Promise<number> {
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

  async markAsRead(notificationId: number, userId: number): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, user_id: userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.is_read = 1;
    await this.notificationRepository.save(notification);

    await this.redisService.del(`unread:${userId}`);
  }

  async markAllAsRead(userId: number): Promise<void> {
    await this.notificationRepository.update(
      { user_id: userId, is_read: 0 },
      { is_read: 1 },
    );

    await this.redisService.del(`unread:${userId}`);
  }

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

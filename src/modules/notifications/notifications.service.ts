import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
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
  EMAIL_LAYOUT_TEMPLATE_EN,
  EMAIL_TEMPLATE_DEFAULTS,
  type EmailTemplateEventKey,
} from './email.templates';
import { SettingsService } from '../settings/settings.service';
import { isDuplicateKeyError } from '@common/utils/db-error.util';
import { NotificationStreamService } from './notification-stream.service';
import { TemplateService } from './template.service';
import { SiteConfigService } from '../../config/site-profile';
import { UserBlocksService } from '../user-blocks/user-blocks.service';
import { escapeMarkdownText } from '@common/utils/email-template.util';

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
    @Optional() private readonly siteConfig?: SiteConfigService,
    @Optional() private readonly userBlocks?: UserBlocksService,
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
    return this.settingsService.getPublicSiteUrl();
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

  private escapeMarkdownTemplateVariables(variables: Record<string, unknown>): Record<string, unknown> {
    const escaped = { ...variables };
    for (const key of [
      'username',
      'actor_name',
      'post_title',
      'reply_excerpt',
      'mention_excerpt',
      'sender_name',
      'message_excerpt',
    ]) {
      if (typeof escaped[key] === 'string') {
        escaped[key] = escapeMarkdownText(escaped[key] as string);
      }
    }
    return escaped;
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
    const username = user.username || (this.siteConfig?.current.profile === 'mindustry-club' ? 'there' : '用户');
    const titleVariables = { username, site_name: siteName };
    const bodyVariables = { username: escapeMarkdownText(username), site_name: siteName };

    const titleTemplate = emailSettings.welcome_notification_title || DEFAULT_WELCOME_NOTIFICATION_TITLE;
    const bodyTemplate = emailSettings.welcome_notification_body || DEFAULT_WELCOME_NOTIFICATION_BODY;
    const title = escapeMarkdownText(this.templateService.render(titleTemplate, titleVariables));
    const body = this.templateService.render(bodyTemplate, bodyVariables);

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
    if (!user || !user.email || !user.email_verified) return;

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
      username: user.username || (this.siteConfig?.current.profile === 'mindustry-club' ? 'there' : '用户'),
      site_name: siteName,
      preferences_url: `${frontendUrl}/settings`,
      year: new Date().getFullYear(),
    };

    const subjectTemplate = emailSettings[templateConfig.subjectSettingKey] || templateConfig.defaultSubject;
    const bodyTemplate = emailSettings[templateConfig.bodySettingKey] || templateConfig.defaultBody;
    const subject = this.sanitizeHeaderValue(this.templateService.render(subjectTemplate, variables));
    const contentMarkdown = this.templateService.render(
      bodyTemplate,
      this.escapeMarkdownTemplateVariables(variables),
    );
    const layout = this.siteConfig?.current.profile === 'mindustry-club' ? EMAIL_LAYOUT_TEMPLATE_EN : EMAIL_LAYOUT_TEMPLATE;
    const html = this.templateService.render(layout, {
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
        text: contentMarkdown,
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
    /** Stable internal event scope; editor calls omit it to retain re-mention behavior. */
    deduplicationKey?: string;
  }): Promise<Notification> {
    const deduplicationKey = data.deduplicationKey ?? (data.reply_id && ['reply', 'mention'].includes(data.type)
      ? `reply:${data.reply_id}:${data.type}:${data.user_id}` : null);
    let duplicate = false;
    let notification = this.notificationRepository.create({
      deduplication_key: deduplicationKey,
      user_id: data.user_id,
      type: data.type,
      actor_id: data.actor_id,
      post_id: data.post_id,
      reply_id: data.reply_id,
      content: data.content,
      is_read: 0,
    });
    try {
      await this.notificationRepository.save(notification);
    } catch (error) {
      if (!deduplicationKey || !isDuplicateKeyError(error)) throw error;
      const existing = await this.notificationRepository.findOne({ where: { deduplication_key: deduplicationKey } });
      if (!existing) throw error;
      notification = existing;
      duplicate = true;
    }

    if (!duplicate && data.emailEvent !== false) {
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

    try {
      await this.queueEmailIfEnabled(userId, 'welcome', {
        content,
        action_url: frontendUrl,
      });
    } catch (error) {
      this.logger.warn(`Failed to queue welcome email for user ${userId}: ${(error as Error).message}`);
    }
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
    if (post.user_id === data.actor_id || !await this.canReceivePostNotification(postId, post.user_id)) {
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

  async canReceivePostNotification(postId: number, userId: number): Promise<boolean> {
    return (await this.eligibleMentionIds([userId], postId)).includes(userId);
  }

  /** A mention must not email restricted body text to a recipient outside its group. */
  private async eligibleMentionIds(ids: number[], postId: number): Promise<number[]> {
    if (!ids.length) return [];
    const post = await this.postRepository.findOne({ where: { id: postId }, select: ['id', 'status', 'required_group_id'] });
    if (!post || post.status !== 'published') return [];
    if (!post.required_group_id) return ids;
    const rows = await this.userRepository.createQueryBuilder('recipient')
      .select(['recipient.id'])
      .where('recipient.id IN (:...recipientIds)', { recipientIds: ids })
      .andWhere(`(recipient.role IN (:...staffRoles) OR EXISTS (SELECT 1 FROM group_members mention_member WHERE mention_member.group_id = :groupId AND mention_member.user_id = recipient.id))`, {
        staffRoles: ['admin', 'moderator'], groupId: post.required_group_id,
      }).getMany();
    return rows.map((row) => row.id);
  }

  async notifyMentionedUsers(
    content: string,
    postId: number,
    actorId: number,
    replyId?: number,
    skipUserIds: number[] = [],
    strict = false,
    deduplicationScope?: string,
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

    return this.notifyMentionedUserIds(mentionedUsers.map((user) => user.id), postId, actorId, content, replyId, skipUserIds, strict, deduplicationScope);
  }

  /** Notify from validated schema-v2 mention identities, deduped by user id. */
  async notifyMentionedUserIds(
    userIds: number[],
    postId: number,
    actorId: number,
    content: string,
    replyId?: number,
    skipUserIds: number[] = [],
    strict = false,
    deduplicationScope?: string,
  ): Promise<Notification[]> {
    const uniqueIds = [...new Set(userIds)].filter((id) => Number.isSafeInteger(id) && id > 0 && id !== actorId && !skipUserIds.includes(id));
    if (!uniqueIds.length) return [];
    const eligibleIds = await this.eligibleMentionIds(uniqueIds, postId);
    if (!eligibleIds.length) return [];
    const users = await this.userRepository.find({ where: { id: In(eligibleIds) }, select: { id: true } });
    const notifications: Notification[] = [];
    for (const user of users) {
      if (this.userBlocks) {
        const [actorBlockedRecipient, recipientBlockedActor] = await Promise.all([
          this.userBlocks.isBlocked(actorId, user.id),
          this.userBlocks.isBlocked(user.id, actorId),
        ]);
        if (actorBlockedRecipient || recipientBlockedActor) continue;
      }
      try {
        notifications.push(await this.create({
          user_id: user.id,
          type: 'mention',
          ...(deduplicationScope ? { deduplicationKey: `${deduplicationScope}:mention:${user.id}` } : {}),
          actor_id: actorId,
          post_id: postId,
          reply_id: replyId,
          content,
        }));
      } catch (error) {
        if (strict) throw error;
        this.logger.warn(`Failed to notify mentioned user ${user.id}: ${(error as Error).message}`);
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

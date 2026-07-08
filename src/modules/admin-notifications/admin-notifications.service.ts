import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../database/redis.service';
import { AdminNotification, User } from '@entities/index';
import { SettingsService } from '../settings/settings.service';

export const ADMIN_NOTIFICATIONS_REDIS_CHANNEL = 'admin-notifications:events';

export type AdminNotificationLevel = 'info' | 'success' | 'warning' | 'error';
export type AdminNotificationRecipientRole = 'moderator' | 'admin';

export interface AdminNotificationView {
  id: number;
  user_id: number;
  event_key: string;
  category: string;
  level: AdminNotificationLevel;
  title: string;
  content: string | null;
  action_url: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface PublishAdminNotificationInput {
  user_ids?: number[];
  roles?: AdminNotificationRecipientRole[];
  event_key: string;
  category: string;
  level?: AdminNotificationLevel;
  title: string;
  content?: string | null;
  action_url?: string | null;
  metadata?: Record<string, unknown>;
  preference_key?: string;
}

@Injectable()
export class AdminNotificationsService {
  private readonly logger = new Logger(AdminNotificationsService.name);

  constructor(
    @InjectRepository(AdminNotification)
    private readonly adminNotificationRepository: Repository<AdminNotification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly settingsService: SettingsService,
    private readonly redisService: RedisService,
  ) {}

  async publish(input: PublishAdminNotificationInput): Promise<AdminNotificationView[]> {
    if (!(await this.settingsService.getBoolean('admin_notifications_enabled', true))) {
      return [];
    }

    if (
      input.preference_key
      && !(await this.settingsService.getBoolean(input.preference_key, true))
    ) {
      return [];
    }

    const recipientIds = await this.resolveRecipientIds(input.user_ids, input.roles);
    if (recipientIds.length === 0) {
      return [];
    }

    const entities = recipientIds.map((userId) => this.adminNotificationRepository.create({
      user_id: userId,
      event_key: input.event_key,
      category: input.category,
      level: input.level || 'info',
      title: input.title,
      content: input.content ?? null,
      action_url: input.action_url ?? null,
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      is_read: 0,
      read_at: null,
    }));

    const saved = await this.adminNotificationRepository.save(entities);
    const normalized = saved.map((item) => this.normalizeNotification(item));

    if (await this.settingsService.getBoolean('admin_notifications_realtime_enabled', true)) {
      await Promise.all(normalized.map((notification) => this.publishRealtime(notification)));
    }

    return normalized;
  }

  async publishModerationPending(input: {
    item_type: 'post' | 'reply' | 'avatar' | 'resource';
    item_id: number;
    title?: string | null;
    content?: string | null;
    author_username: string;
    action_url: string;
  }): Promise<AdminNotificationView[]> {
    const itemLabel = this.getModerationItemLabel(input.item_type);
    const title = input.item_type === 'avatar'
      ? `新的待审核${itemLabel}: ${input.author_username}`
      : `新的待审核${itemLabel}: ${input.title || `#${input.item_id}`}`;
    const detail = input.item_type === 'avatar'
      ? `用户 ${input.author_username} 提交了新的头像，等待审核。`
      : `作者 ${input.author_username} 提交了新的${itemLabel}，等待审核。`;

    return this.publish({
      event_key: `moderation.${input.item_type}.pending`,
      category: 'moderation',
      level: 'warning',
      title,
      content: `${detail}${this.buildExcerpt(input.content)}`,
      action_url: input.action_url,
      metadata: {
        item_type: input.item_type,
        item_id: input.item_id,
        author_username: input.author_username,
      },
      preference_key: 'admin_notifications_moderation_pending_enabled',
    });
  }

  async publishModerationResult(input: {
    item_type: 'post' | 'reply' | 'avatar' | 'resource';
    item_id: number;
    action: 'approved' | 'rejected';
    actor_username?: string | null;
    subject?: string | null;
    action_url?: string | null;
  }): Promise<AdminNotificationView[]> {
    const itemLabel = this.getModerationItemLabel(input.item_type);
    const actionLabel = input.action === 'approved' ? '已通过' : '已拒绝';
    const actorPrefix = input.actor_username ? `${input.actor_username} ` : '';

    return this.publish({
      event_key: `moderation.${input.item_type}.${input.action}`,
      category: 'moderation',
      level: input.action === 'approved' ? 'success' : 'info',
      title: `${actorPrefix}${actionLabel}${itemLabel}`,
      content: input.subject
        ? `${itemLabel}内容: ${input.subject}`
        : `编号 #${input.item_id} 的${itemLabel}${actionLabel}。`,
      action_url: input.action_url ?? null,
      metadata: {
        item_type: input.item_type,
        item_id: input.item_id,
        action: input.action,
        actor_username: input.actor_username ?? null,
      },
      preference_key: 'admin_notifications_moderation_result_enabled',
    });
  }

  async getByUserId(
    userId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ notifications: AdminNotificationView[]; total: number }> {
    const [notifications, total] = await this.adminNotificationRepository.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      notifications: notifications.map((item) => this.normalizeNotification(item)),
      total,
    };
  }

  async getUnreadCount(userId: number): Promise<number> {
    return this.adminNotificationRepository.count({
      where: { user_id: userId, is_read: 0 },
    });
  }

  async markAsRead(notificationId: number, userId: number): Promise<void> {
    const notification = await this.adminNotificationRepository.findOne({
      where: { id: notificationId, user_id: userId },
    });

    if (!notification) {
      throw new NotFoundException('Admin notification not found');
    }

    if (notification.is_read === 1) {
      return;
    }

    notification.is_read = 1;
    notification.read_at = new Date();
    await this.adminNotificationRepository.save(notification);
  }

  async markAllAsRead(userId: number): Promise<void> {
    await this.adminNotificationRepository.update(
      { user_id: userId, is_read: 0 },
      { is_read: 1, read_at: new Date() },
    );
  }

  private async resolveRecipientIds(
    explicitUserIds?: number[],
    explicitRoles?: AdminNotificationRecipientRole[],
  ): Promise<number[]> {
    const result = new Set<number>();

    for (const userId of explicitUserIds || []) {
      if (Number.isFinite(userId)) {
        result.add(userId);
      }
    }

    const roles = explicitRoles?.length
      ? explicitRoles
      : this.parseRecipientRoles(await this.settingsService.get('admin_notifications_recipient_roles'));

    if (roles.length > 0) {
      const users = await this.userRepository.find({
        where: roles.map((role) => ({ role })),
        select: {
          id: true,
        },
      });

      for (const user of users) {
        result.add(user.id);
      }
    }

    return [...result];
  }

  private parseRecipientRoles(raw: string | null): AdminNotificationRecipientRole[] {
    const allowed = new Set<AdminNotificationRecipientRole>(['moderator', 'admin']);
    const values = (raw || 'moderator,admin')
      .split(',')
      .map((item) => item.trim())
      .filter((item): item is AdminNotificationRecipientRole => allowed.has(item as AdminNotificationRecipientRole));

    return [...new Set(values)];
  }

  private getModerationItemLabel(itemType: 'post' | 'reply' | 'avatar' | 'resource'): string {
    switch (itemType) {
      case 'post':
        return '帖子';
      case 'reply':
        return '回复';
      case 'avatar':
        return '头像';
      case 'resource':
        return '资源';
      default:
        return '内容';
    }
  }

  private buildExcerpt(content?: string | null): string {
    const value = (content || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!value) {
      return '';
    }

    const excerpt = value.length > 120 ? `${value.slice(0, 120)}...` : value;
    return ` 内容摘要: ${excerpt}`;
  }

  private normalizeNotification(notification: AdminNotification): AdminNotificationView {
    let metadata: Record<string, unknown> | null = null;
    if (notification.metadata_json) {
      try {
        metadata = JSON.parse(notification.metadata_json);
      } catch (error) {
        this.logger.warn(`Failed to parse admin notification metadata ${notification.id}`);
      }
    }

    return {
      id: notification.id,
      user_id: notification.user_id,
      event_key: notification.event_key,
      category: notification.category,
      level: (notification.level as AdminNotificationLevel) || 'info',
      title: notification.title,
      content: notification.content,
      action_url: notification.action_url,
      metadata,
      is_read: notification.is_read === 1,
      read_at: notification.read_at ? notification.read_at.toISOString() : null,
      created_at: notification.created_at.toISOString(),
    };
  }

  private async publishRealtime(notification: AdminNotificationView): Promise<void> {
    await this.redisService.getClient().publish(
      ADMIN_NOTIFICATIONS_REDIS_CHANNEL,
      JSON.stringify({
        userId: notification.user_id,
        eventType: 'admin-notification',
        data: notification,
      }),
    );
  }
}

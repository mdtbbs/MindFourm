import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { RedisService } from '../../database/redis.service';
import { NotificationStreamService } from '../notifications/notification-stream.service';
import { Friendship } from '../../entities/friendship.entity';
import {
  PresenceData,
  PRESENCE_TTL_SECONDS,
  PRESENCE_PUSH_COOLDOWN_SECONDS,
  presenceKey,
  parsePresenceUserId,
} from './presence.data';

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);

  /**
   * Separate Redis client in subscriber mode.
   * ioredis does not allow regular commands on a subscribed client, so we
   * duplicate the connection solely for keyspace notifications.
   */
  private subscriber: Redis | null = null;
  private subscriptionReady = false;

  constructor(
    private redisService: RedisService,
    private notificationStream: NotificationStreamService,
    @InjectRepository(Friendship)
    private friendshipRepo: Repository<Friendship>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.subscribeToKeyspaceNotifications();
  }

  onModuleDestroy(): void {
    if (this.subscriber) {
      this.subscriber.disconnect();
      this.subscriber = null;
    }
    this.subscriptionReady = false;
  }

  /**
   * Write presence data to Redis with TTL.
   * Called by LanLink via External API.
   */
  async setPresence(userId: number, data: PresenceData): Promise<void> {
    const key = presenceKey(userId);
    const value = JSON.stringify(data);
    await this.redisService.set(key, value, PRESENCE_TTL_SECONDS);
  }

  /**
   * Delete presence data for a user.
   * Typically called when the user goes offline.
   */
  async deletePresence(userId: number): Promise<void> {
    const key = presenceKey(userId);
    await this.redisService.del(key);
  }

  /**
   * Read presence data for a single user.
   */
  async getPresence(userId: number): Promise<PresenceData | null> {
    const key = presenceKey(userId);
    const raw = await this.redisService.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PresenceData;
    } catch {
      return null;
    }
  }

  /**
   * Batch read presence data for multiple users.
   * Users with no data (or TTL expired) return { status: 'offline' }.
   */
  async getPresences(userIds: number[]): Promise<Map<number, PresenceData>> {
    const result = new Map<number, PresenceData>();
    if (userIds.length === 0) return result;

    const keys = userIds.map((id) => presenceKey(id));
    const client = this.redisService.getClient();

    let values: (string | null)[];
    try {
      values = await client.mget(...keys);
    } catch {
      // Fallback to individual gets if mget fails
      values = await Promise.all(
        keys.map((k) => this.redisService.get(k)),
      );
    }

    for (let i = 0; i < userIds.length; i++) {
      const raw = values[i];
      if (raw) {
        try {
          result.set(userIds[i], JSON.parse(raw) as PresenceData);
        } catch {
          result.set(userIds[i], { status: 'offline', updated_at: Date.now() });
        }
      } else {
        result.set(userIds[i], { status: 'offline', updated_at: Date.now() });
      }
    }

    return result;
  }

  /**
   * Get all friend IDs for a user (both directions).
   */
  async getFriendIds(userId: number): Promise<number[]> {
    const friendships = await this.friendshipRepo.find({
      where: [
        { requester_id: userId, status: 'accepted' },
        { addressee_id: userId, status: 'accepted' },
      ],
      select: ['requester_id', 'addressee_id'],
    });

    const ids = new Set<number>();
    for (const f of friendships) {
      if (f.requester_id !== userId) ids.add(f.requester_id);
      if (f.addressee_id !== userId) ids.add(f.addressee_id);
    }
    return [...ids];
  }

  /**
   * Subscribe to Redis keyspace notifications for presence:* keys.
   * On set/del events, push presence changes to the user's friends via SSE.
   */
  private async subscribeToKeyspaceNotifications(): Promise<void> {
    const client = this.redisService.getClient();

    // Check if keyspace notifications are enabled
    try {
      const config = await client.config('GET', 'notify-keyspace-events');
      const currentValue = Array.isArray(config) ? config[1] : (config as any);
      if (!currentValue || currentValue === '') {
        this.logger.warn(
          'Redis notify-keyspace-events is not enabled. ' +
          'Presence change notifications will not be pushed to friends. ' +
          'Set notify-keyspace-events to "KEA" or at least "Kx" to enable.',
        );
        return;
      }
    } catch (err) {
      this.logger.warn(
        `Failed to check Redis keyspace notification config: ${(err as Error).message}. ` +
        'Presence push will be disabled.',
      );
      return;
    }

    // Create a duplicate client for subscribing (subscriber mode)
    try {
      this.subscriber = client.duplicate();
      this.subscriber.on('error', (err) => {
        this.logger.warn(`Presence keyspace subscriber error: ${err.message}`);
      });

      await new Promise<void>((resolve) => {
        this.subscriber!.on('ready', () => resolve());
      });

      // Subscribe to keyspace notifications for presence:* keys
      const dbIndex = (client.options as any).db || 0;
      const channel = `__keyspace@${dbIndex}__:presence:*`;

      await this.subscriber.subscribe(channel);
      this.subscriptionReady = true;
      this.logger.log(`Subscribed to Redis keyspace notifications on ${channel}`);

      this.subscriber.on('message', async (_channel: string, key: string) => {
        await this.handleKeyspaceEvent(key);
      });
    } catch (err) {
      this.logger.warn(
        `Failed to subscribe to keyspace notifications: ${(err as Error).message}. ` +
        'Presence push will be disabled.',
      );
    }
  }

  /**
   * Handle a keyspace event for a presence:* key.
   * Reads the latest value (or offline if deleted) and pushes to friends.
   */
  private async handleKeyspaceEvent(key: string): Promise<void> {
    const userId = parsePresenceUserId(key);
    if (!userId) return;

    // Rate limit: 30s cooldown per user
    if (await this.isPushCooldownActive(userId)) {
      return;
    }

    const presence = await this.getPresence(userId);
    const eventData = presence
      ? {
          friend_user_id: userId,
          status: presence.status,
          room_code: presence.room_code,
          room_name: presence.room_name,
          node_name: presence.node_name,
          updated_at: presence.updated_at,
        }
      : {
          friend_user_id: userId,
          status: 'offline',
          updated_at: Date.now(),
        };

    // Get friend IDs and push to each
    const friendIds = await this.getFriendIds(userId);
    for (const friendId of friendIds) {
      this.notificationStream.pushRaw(friendId, 'friend_presence', eventData);
    }

    // Record cooldown
    await this.setPushCooldown(userId);
  }

  /**
   * Check if push cooldown is active for a user.
   */
  private async isPushCooldownActive(userId: number): Promise<boolean> {
    const cooldownKey = `presence_push_cooldown:${userId}`;
    const exists = await this.redisService.exists(cooldownKey);
    return exists > 0;
  }

  /**
   * Set push cooldown for a user.
   */
  private async setPushCooldown(userId: number): Promise<void> {
    const cooldownKey = `presence_push_cooldown:${userId}`;
    await this.redisService.set(cooldownKey, '1', PRESENCE_PUSH_COOLDOWN_SECONDS);
  }
}

import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import Redis from 'ioredis';
import { RedisService } from '../../database/redis.service';
import { ADMIN_NOTIFICATIONS_REDIS_CHANNEL } from './admin-notifications.service';

interface StreamMessagePayload {
  userId: number;
  eventType: string;
  data: unknown;
}

@Injectable()
export class AdminNotificationStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminNotificationStreamService.name);
  private readonly notificationSubjects = new Map<number, Subject<MessageEvent>>();
  private redisSubscriber: Redis | null = null;

  constructor(private readonly redisService: RedisService) {}

  async onModuleInit(): Promise<void> {
    try {
      this.redisSubscriber = this.redisService.getClient().duplicate();
      this.redisSubscriber.on('message', (_channel, message) => {
        this.handleMessage(message);
      });
      await this.redisSubscriber.subscribe(ADMIN_NOTIFICATIONS_REDIS_CHANNEL);
    } catch (error) {
      this.logger.warn(`Admin notification stream disabled: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const subject of this.notificationSubjects.values()) {
      subject.complete();
    }
    this.notificationSubjects.clear();

    if (this.redisSubscriber) {
      await this.redisSubscriber.quit().catch(() => undefined);
      this.redisSubscriber = null;
    }
  }

  createStream(userId: number): Observable<MessageEvent> {
    if (!this.notificationSubjects.has(userId)) {
      this.notificationSubjects.set(userId, new Subject<MessageEvent>());
    }

    const subject = this.notificationSubjects.get(userId);
    if (!subject) {
      throw new Error('Failed to create admin notification stream');
    }

    subject.next({
      type: 'system',
      data: JSON.stringify({ type: 'connected', userId }),
    } as MessageEvent);

    return subject.asObservable();
  }

  private handleMessage(rawMessage: string): void {
    try {
      const payload = JSON.parse(rawMessage) as StreamMessagePayload;
      if (!Number.isFinite(payload.userId)) {
        return;
      }

      const subject = this.notificationSubjects.get(payload.userId);
      if (!subject) {
        return;
      }

      subject.next({
        type: payload.eventType,
        data: JSON.stringify(payload.data),
      } as MessageEvent);
    } catch (error) {
      this.logger.warn(`Failed to handle admin notification stream message: ${(error as Error).message}`);
    }
  }
}

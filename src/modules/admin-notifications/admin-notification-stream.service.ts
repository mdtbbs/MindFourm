import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Observable, Subject, concat, interval, merge, of } from 'rxjs';
import { finalize, map, tap } from 'rxjs/operators';
import Redis from 'ioredis';
import { RedisService } from '../../database/redis.service';
import { ADMIN_NOTIFICATIONS_REDIS_CHANNEL } from './admin-notifications.service';

interface StreamMessagePayload {
  userId: number;
  eventType: string;
  data: unknown;
}

const SSE_HEARTBEAT_INTERVAL_MS = 20_000;

@Injectable()
export class AdminNotificationStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AdminNotificationStreamService.name);
  private readonly notificationSubjects = new Map<number, Set<Subject<MessageEvent>>>();
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
    for (const subjects of this.notificationSubjects.values()) {
      for (const subject of subjects) {
        subject.complete();
      }
    }
    this.notificationSubjects.clear();

    if (this.redisSubscriber) {
      await this.redisSubscriber.quit().catch(() => undefined);
      this.redisSubscriber = null;
    }
  }

  createStream(userId: number): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();
    const connected = {
      type: 'system',
      data: JSON.stringify({ type: 'connected', userId }),
    } as MessageEvent;
    const heartbeat = interval(SSE_HEARTBEAT_INTERVAL_MS).pipe(
      map(() => ({ type: 'system', data: JSON.stringify({ type: 'heartbeat' }) }) as MessageEvent),
    );

    // Each tab owns a Subject. This prevents a disconnect in one admin tab from
    // completing the stream in another and lets finalization release the entry.
    return concat(of(connected), merge(subject.asObservable(), heartbeat)).pipe(
      tap({
        subscribe: () => {
          const subjects = this.notificationSubjects.get(userId) ?? new Set<Subject<MessageEvent>>();
          subjects.add(subject);
          this.notificationSubjects.set(userId, subjects);
        },
      }),
      finalize(() => {
        const subjects = this.notificationSubjects.get(userId);
        if (!subjects) return;
        subjects.delete(subject);
        subject.complete();
        if (subjects.size === 0) this.notificationSubjects.delete(userId);
      }),
    );
  }

  private handleMessage(rawMessage: string): void {
    try {
      const payload = JSON.parse(rawMessage) as StreamMessagePayload;
      if (!Number.isFinite(payload.userId)) {
        return;
      }

    const subjects = this.notificationSubjects.get(payload.userId);
    if (!subjects) {
      return;
    }

    for (const subject of subjects) {
      subject.next({
        type: payload.eventType,
        data: JSON.stringify(payload.data),
      } as MessageEvent);
    }
    } catch (error) {
      this.logger.warn(`Failed to handle admin notification stream message: ${(error as Error).message}`);
    }
  }
}

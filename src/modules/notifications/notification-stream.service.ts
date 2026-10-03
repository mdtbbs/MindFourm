import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { Subject } from 'rxjs';
import { RedisService } from '../../database/redis.service';

export interface RawStreamEvent {
  userId: number;
  type: string;
  data: any;
}

type BridgeEvent = { origin: string; userId: number } & (
  { kind: 'notification'; notification: any } | { kind: 'raw'; type: string; data: any }
);

/** Local SSE connections stay in their worker; Redis fans events out to every worker. */
@Injectable()
export class NotificationStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationStreamService.name);
  private readonly origin = randomUUID();
  private readonly channel = 'forum:notification-stream:v1';
  private subscriber?: Redis;
  private destroyed = false;
  private subject = new Subject<{ userId: number; notification: any }>();
  private rawSubject = new Subject<RawStreamEvent>();
  readonly stream$ = this.subject.asObservable();
  readonly rawStream$ = this.rawSubject.asObservable();

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    const client = this.redis.getClient();
    if (!client) return;
    // A dedicated connection is necessary: subscribed Redis clients cannot run
    // regular commands. ioredis re-subscribes after connection recovery.
    this.subscriber = client.duplicate({ enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    this.subscriber.on('error', () => this.logger.warn('Notification fan-out unavailable; local SSE remains active'));
    this.subscriber.on('ready', () => {
      void this.subscriber?.subscribe(this.channel).catch(() => this.logger.warn('Unable to subscribe notification fan-out'));
    });
    this.subscriber.on('message', (channel, payload) => {
      if (channel !== this.channel || this.destroyed) return;
      try {
        const event: BridgeEvent = JSON.parse(payload);
        if (event.origin === this.origin || !Number.isSafeInteger(event.userId) || event.userId < 1) return;
        if (event.kind === 'notification') this.subject.next({ userId: event.userId, notification: event.notification });
        else if (event.kind === 'raw' && typeof event.type === 'string') this.rawSubject.next({ userId: event.userId, type: event.type, data: event.data });
      } catch { /* Ignore malformed events without logging private payloads. */ }
    });
  }

  private publish(event: BridgeEvent): void {
    if (this.destroyed || !this.redis.isRedisAvailable()) return;
    try {
      void this.redis.publishRealtime(this.channel, JSON.stringify(event))
        .catch(() => this.logger.warn('Unable to publish notification fan-out'));
    } catch { this.logger.warn('Unable to serialize notification fan-out'); }
  }

  push(userId: number, notification: any): void {
    if (this.destroyed) return;
    this.subject.next({ userId, notification });
    this.publish({ origin: this.origin, kind: 'notification', userId, notification });
  }

  pushRaw(userId: number, type: string, data: any): void {
    if (this.destroyed) return;
    this.rawSubject.next({ userId, type, data });
    this.publish({ origin: this.origin, kind: 'raw', userId, type, data });
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    this.subject.complete();
    this.rawSubject.complete();
    this.subscriber?.removeAllListeners();
    // Disconnect synchronously rather than waiting for QUIT while Redis is down.
    this.subscriber?.disconnect();
  }
}

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { RedisService } from '@database/redis.service';
import { randomUUID } from 'crypto';
import { OutboxEvent } from '@entities/outbox-event.entity';

/**
 * Event Service — writes durable events to the outbox.
 *
 * Uses the Transactional Outbox pattern: events are written in the same
 * database transaction as the business operation, ensuring at-least-once
 * delivery without distributed transactions.
 *
 * Redis Pub/Sub is used only for real-time fan-out (SSE), never as the
 * durable event source.
 */

export type EventPayload = {
  eventKey: string;
  aggregateType: string;
  aggregateId: number;
  payload: Record<string, unknown>;
};

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private handlers = new Map<string, (event: OutboxEvent) => Promise<void>>();
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    @Optional() private readonly redis?: RedisService,
  ) {}

  register(eventKey: string, handler: (event: OutboxEvent) => Promise<void>): void {
    if (this.handlers.has(eventKey)) throw new Error(`Duplicate outbox handler: ${eventKey}`);
    this.handlers.set(eventKey, handler);
  }

  onModuleInit(): void {
    if (process.env.OPENAPI_EXPORT === 'true') return;
    this.timer = setInterval(() => void this.processPending().catch((error) => this.logger.warn(`Outbox worker failed: ${error.message}`)), 2500);
    this.timer.unref();
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async processPending(): Promise<void> {
    // Distributed leases must never degrade to one lock per process.
    if (this.running || !this.redis?.isRedisAvailable() || !this.handlers.size) return;
    this.running = true;
    try {
      const events = await this.outboxRepo.createQueryBuilder('event')
        .where("(event.status = 'pending' OR (event.status = 'failed' AND event.retry_count < 10 AND event.next_attempt_at <= NOW()))")
        .andWhere('event.event_key IN (:...eventKeys)', { eventKeys: [...this.handlers.keys()] })
        .orderBy('event.id', 'ASC').take(50).getMany();
      for (const event of events) {
        const handler = this.handlers.get(event.event_key);
        if (!handler) continue;
        const owner = randomUUID(), key = `outbox:lease:${event.id}`;
        // Acquire directly: RedisService's generic SET NX can fall back to a
        // process-local map, which cannot coordinate workers on different hosts.
        const redis = this.redis.getClient();
        if (await redis.set(key, owner, 'EX', 120, 'NX') !== 'OK') continue;
        let leaseLost = false;
        let renewal: Promise<void> | undefined;
        const renew = setInterval(() => {
          if (renewal) return;
          renewal = redis.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('EXPIRE', KEYS[1], 120); end; return 0", 1, key, owner)
            .then((held) => { if (Number(held) !== 1) leaseLost = true; })
            .catch(() => { leaseLost = true; }).finally(() => { renewal = undefined; });
        }, 30000);
        renew.unref();
        try {
          const current = await this.outboxRepo.findOne({ where: { id: event.id } });
          if (!current || current.status === 'processed' || (current.status === 'failed' && (current.retry_count >= 10 || (current.next_attempt_at && current.next_attempt_at.getTime() > Date.now())))) continue;
          await handler(current);
          if (!leaseLost && await redis.get(key) === owner) await this.markProcessed(event.id);
        } catch (error) {
          if (!leaseLost && await redis.get(key) === owner) await this.markFailed(event.id, (error as Error).message);
        } finally {
          clearInterval(renew);
          if (renewal) await renewal;
          await redis.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]); end; return 0", 1, key, owner).catch(() => undefined);
        }
      }
    } finally { this.running = false; }
  }

  /**
   * Write an event to the outbox. Should be called within the same
   * transaction as the business operation.
   */
  async publish(event: EventPayload, manager?: EntityManager): Promise<OutboxEvent> {
    const repo = manager ? manager.getRepository(OutboxEvent) : this.outboxRepo;
    const outboxEvent = repo.create({
      event_key: event.eventKey,
      aggregate_type: event.aggregateType,
      aggregate_id: event.aggregateId,
      payload_json: event.payload,
      status: 'pending',
    });

    const saved = await repo.save(outboxEvent);
    this.logger.verbose(`Outbox event published: ${event.eventKey} aggregate=${event.aggregateType}:${event.aggregateId}`);
    return saved;
  }

  /**
   * Fetch pending events for processing.
   */
  async getPendingEvents(limit: number = 50): Promise<OutboxEvent[]> {
    return this.outboxRepo.find({
      where: { status: 'pending' },
      order: { created_at: 'ASC' },
      take: limit,
    });
  }

  /**
   * Mark an event as processed.
   */
  async markProcessed(eventId: number): Promise<void> {
    await this.outboxRepo.update(eventId, {
      status: 'processed',
      processed_at: new Date(),
      next_attempt_at: null,
    });
  }

  /**
   * Mark an event as failed with error details.
   */
  async markFailed(eventId: number, error: string): Promise<void> {
    const event = await this.outboxRepo.findOne({ where: { id: eventId } });
    if (!event) return;

    await this.outboxRepo.update(eventId, {
      status: 'failed',
      retry_count: event.retry_count + 1,
      last_error: error.slice(0, 1000),
      next_attempt_at: new Date(Date.now() + Math.min(300000, 2500 * 2 ** event.retry_count)),
    });
  }
}

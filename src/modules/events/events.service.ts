import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
  ) {}

  /**
   * Write an event to the outbox. Should be called within the same
   * transaction as the business operation.
   */
  async publish(event: EventPayload): Promise<OutboxEvent> {
    const outboxEvent = this.outboxRepo.create({
      event_key: event.eventKey,
      aggregate_type: event.aggregateType,
      aggregate_id: event.aggregateId,
      payload_json: event.payload,
      status: 'pending',
    });

    const saved = await this.outboxRepo.save(outboxEvent);
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
      last_error: error,
    });
  }
}

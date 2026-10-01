import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../database/redis.service';

export interface RealtimeEvent {
  id: string;
  event: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export type RealtimeResumeResult =
  | { resumed: true; events: RealtimeEvent[] }
  | { resumed: false; reason: 'cursor_expired'; events: [] };

function streamIdValue(value: string): [bigint, bigint] {
  const [time = '0', sequence = '0'] = value.split('-', 2);
  return [BigInt(time), BigInt(sequence)];
}

function olderThan(left: string, right: string): boolean {
  const [leftTime, leftSequence] = streamIdValue(left);
  const [rightTime, rightSequence] = streamIdValue(right);
  return leftTime < rightTime || (leftTime === rightTime && leftSequence < rightSequence);
}

@Injectable()
export class RealtimeEventsService {
  private readonly logger = new Logger(RealtimeEventsService.name);

  constructor(private readonly redis: RedisService) {}

  async emitUser(userId: number, event: string, data: Record<string, unknown>): Promise<string | null> {
    return this.append(`events:user:${userId}`, `realtime:user:${userId}`, event, data);
  }

  async emitSession(sessionId: string, event: string, data: Record<string, unknown>): Promise<string | null> {
    return this.append(`events:session:${sessionId}`, `realtime:session:${sessionId}`, event, data);
  }

  async resumeUser(userId: number, lastEventId: string): Promise<RealtimeResumeResult> {
    return this.resume(`events:user:${userId}`, lastEventId);
  }

  async resumeSession(sessionId: string, lastEventId: string): Promise<RealtimeResumeResult> {
    return this.resume(`events:session:${sessionId}`, lastEventId);
  }

  latestUserEventId(userId: number): Promise<string> {
    return this.redis.latestRealtimeEvent(`events:user:${userId}`);
  }

  latestSessionEventId(sessionId: string): Promise<string> {
    return this.redis.latestRealtimeEvent(`events:session:${sessionId}`);
  }

  private async append(stream: string, channel: string, event: string, data: Record<string, unknown>): Promise<string | null> {
    try {
      const id = await this.redis.appendRealtimeEvent(stream, event, data);
      await this.redis.publishRealtime(channel, id).catch(() => undefined);
      return id;
    } catch (error) {
      this.logger.warn(`Realtime event append failed for ${stream}: ${(error as Error).message}`);
      return null;
    }
  }

  private async resume(stream: string, lastEventId: string): Promise<RealtimeResumeResult> {
    if (!/^\d{1,16}-\d{1,10}$/.test(lastEventId)) {
      return { resumed: false, reason: 'cursor_expired', events: [] };
    }
    try {
      const first = await this.redis.firstRealtimeEvent(stream);
      if (first.length && olderThan(lastEventId, first[0][0])) {
        return { resumed: false, reason: 'cursor_expired', events: [] };
      }
      const rows = await this.redis.readRealtimeEvents(stream, `(${lastEventId}`, 200);
      return {
        resumed: true,
        events: rows.map(([id, fields]) => this.toEvent(id, fields)).filter((event): event is RealtimeEvent => !!event),
      };
    } catch (error) {
      this.logger.warn(`Realtime resume read failed for ${stream}: ${(error as Error).message}`);
      return { resumed: false, reason: 'cursor_expired', events: [] };
    }
  }

  private toEvent(id: string, fields: string[]): RealtimeEvent | null {
    const values = Object.fromEntries(Array.from({ length: Math.floor(fields.length / 2) }, (_, index) => [fields[index * 2], fields[index * 2 + 1]]));
    try {
      const data = JSON.parse(values.data || '{}');
      if (!data || typeof data !== 'object' || Array.isArray(data) || !values.event) return null;
      return { id, event: values.event, timestamp: Number(values.timestamp) || 0, data };
    } catch {
      return null;
    }
  }
}

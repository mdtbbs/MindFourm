import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../database/redis.service';

type BlockedRequest = {
  route: string;
  identity: 'user' | 'session' | 'ip';
  limit: number;
  remaining: number;
  ipSource: string;
};

@Injectable()
export class RateLimitTelemetryService {
  private readonly logger = new Logger(RateLimitTelemetryService.name);
  private readonly retentionSeconds = 26 * 60 * 60;

  constructor(private readonly redis: RedisService) {}

  async recordBlocked(event: BlockedRequest): Promise<void> {
    const bucket = this.bucketKey(new Date());
    const route = this.normaliseRoute(event.route);
    try {
      await Promise.all([
        this.increment(bucket, 'total'),
        this.increment(bucket, `route:${route}`),
        this.increment(bucket, `identity:${event.identity}`),
        this.increment(bucket, `ip_source:${event.ipSource}`),
        this.increment(bucket, `limit:${event.limit}`),
      ]);
    } catch (error) {
      // Telemetry must never turn a 429 into an application error.
      this.logger.warn(`Rate-limit telemetry skipped: ${(error as Error).message}`);
    }
  }

  async getLast24Hours(now = new Date()): Promise<{
    total: number;
    hours: Array<{ at: string; blocked: number }>;
    routes: Array<{ route: string; blocked: number }>;
    identities: Record<string, number>;
    ip_sources: Record<string, number>;
  }> {
    const buckets = Array.from({ length: 24 }, (_, index) => {
      const at = new Date(now);
      at.setMinutes(0, 0, 0);
      at.setHours(at.getHours() - (23 - index));
      return at;
    });
    const values = await Promise.all(buckets.map((at) => this.redis.hgetall(this.bucketKey(at))));
    const routes = new Map<string, number>();
    const identities: Record<string, number> = {};
    const ipSources: Record<string, number> = {};
    const hours = values.map((value, index) => {
      for (const [field, raw] of Object.entries(value)) {
        const count = Number(raw) || 0;
        if (field.startsWith('route:')) routes.set(field.slice(6), (routes.get(field.slice(6)) || 0) + count);
        if (field.startsWith('identity:')) identities[field.slice(9)] = (identities[field.slice(9)] || 0) + count;
        if (field.startsWith('ip_source:')) ipSources[field.slice(10)] = (ipSources[field.slice(10)] || 0) + count;
      }
      return { at: buckets[index].toISOString(), blocked: Number(value.total) || 0 };
    });
    return {
      total: hours.reduce((sum, item) => sum + item.blocked, 0),
      hours,
      routes: [...routes.entries()].map(([route, blocked]) => ({ route, blocked })).sort((a, b) => b.blocked - a.blocked).slice(0, 10),
      identities,
      ip_sources: ipSources,
    };
  }

  private async increment(key: string, field: string): Promise<void> {
    await this.redis.hIncrBy(key, field, 1);
    await this.redis.expire(key, this.retentionSeconds);
  }

  private bucketKey(at: Date): string {
    return `rate_limit:telemetry:${at.toISOString().slice(0, 13).replace(/[-T:]/g, '')}`;
  }

  private normaliseRoute(route: string): string {
    return String(route || 'unknown').replace(/\/[0-9]+(?=\/|$)/g, '/:id').slice(0, 160);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../database/redis.service';

type Histogram = Record<'lt100' | 'lt300' | 'lt1000' | 'gte1000', number>;

export interface PerformanceSummary {
  from: string;
  to: string;
  requests: number;
  average_ms: number;
  max_ms: number;
  histogram: Histogram;
  estimated_p50_ms: number;
  estimated_p95_ms: number;
  estimated_p99_ms: number;
  slow_requests: number;
  routes: Array<{ route: string; requests: number; average_ms: number; max_ms: number; slow_requests: number }>;
}

/**
 * Operational timing telemetry deliberately aggregates by a small, fixed route
 * set. It provides an actionable production baseline without retaining URLs,
 * query values, IP addresses, request bodies, or user identifiers.
 */
@Injectable()
export class PerformanceTelemetryService {
  private readonly logger = new Logger(PerformanceTelemetryService.name);
  private readonly retentionSeconds = 26 * 60 * 60;

  constructor(private readonly redis: RedisService) {}

  private hour(date = new Date()): string {
    return date.toISOString().slice(0, 13).replace(/[-T:]/g, '');
  }

  private key(hour: string): string { return `performance:requests:${hour}`; }

  routeFor(pathname: string): string {
    const path = String(pathname || '/').split('?')[0];
    if (path.startsWith('/api/resources')) return 'api.resources';
    if (path.startsWith('/api/posts') || path.startsWith('/api/threads')) return 'api.posts';
    if (path.startsWith('/api/replies')) return 'api.replies';
    if (path.startsWith('/api/attachments') || path.includes('/upload')) return 'api.uploads';
    if (path.startsWith('/api/download')) return 'api.downloads';
    if (path.startsWith('/api/admin')) return 'api.admin';
    if (path.startsWith('/api/')) return 'api.other';
    if (path.startsWith('/resources')) return 'page.resources';
    if (path === '/') return 'page.home';
    return 'page.other';
  }

  private bucket(durationMs: number): keyof Histogram {
    if (durationMs < 100) return 'lt100';
    if (durationMs < 300) return 'lt300';
    if (durationMs < 1000) return 'lt1000';
    return 'gte1000';
  }

  async record(pathname: string, statusCode: number, durationMs: number): Promise<void> {
    // Health probes are frequent and would bias the user-facing baseline.
    if (pathname === '/api/health') return;
    const route = this.routeFor(pathname), key = this.key(this.hour());
    const duration = Math.max(0, Math.min(10 * 60 * 1000, Math.round(durationMs)));
    const status = statusCode >= 500 ? '5xx' : statusCode >= 400 ? '4xx' : 'ok';
    const fields: Array<[string, number]> = [
      ['requests', 1], ['duration_ms', duration], ['max_ms', duration], [`status:${status}`, 1],
      [`route:${route}:requests`, 1], [`route:${route}:duration_ms`, duration], [`route:${route}:max_ms`, duration],
      [`route:${route}:slow`, duration >= 1000 ? 1 : 0], [`histogram:${this.bucket(duration)}`, 1],
    ];
    try {
      for (const [field, increment] of fields) {
        if (field.endsWith(':max_ms') || field === 'max_ms') {
          const current = Number((await this.redis.hget(key, field)) || '0');
          if (duration > current) await this.redis.hset(key, field, String(duration));
        } else await this.redis.hIncrBy(key, field, increment);
      }
      await this.redis.expire(key, this.retentionSeconds);
    } catch (error) {
      // Observability must never add latency or turn a successful request into a failure.
      this.logger.warn(`Unable to record request timing: ${(error as Error).message}`);
    }
  }

  private percentile(histogram: Histogram, percentile: number): number {
    const total = Object.values(histogram).reduce((sum, value) => sum + value, 0);
    if (!total) return 0;
    const target = Math.ceil(total * percentile);
    let seen = 0;
    for (const [name, ceiling] of [['lt100', 100], ['lt300', 300], ['lt1000', 1000], ['gte1000', 1000]] as const) {
      seen += histogram[name];
      if (seen >= target) return ceiling;
    }
    return 1000;
  }

  async summary(hours = 24, now = new Date()): Promise<PerformanceSummary> {
    const count = Math.max(1, Math.min(72, Math.floor(hours) || 24));
    const aggregate: Record<string, number> = {};
    for (let offset = 0; offset < count; offset += 1) {
      const hour = this.hour(new Date(now.getTime() - offset * 60 * 60 * 1000));
      const values = await this.redis.hgetall(this.key(hour));
      for (const [field, value] of Object.entries(values)) aggregate[field] = (aggregate[field] || 0) + Number(value || 0);
    }
    const histogram: Histogram = {
      lt100: aggregate['histogram:lt100'] || 0, lt300: aggregate['histogram:lt300'] || 0,
      lt1000: aggregate['histogram:lt1000'] || 0, gte1000: aggregate['histogram:gte1000'] || 0,
    };
    const requests = aggregate.requests || 0;
    const routeNames = new Set(Object.keys(aggregate).flatMap((field) => {
      const match = /^route:(.+):(requests|duration_ms|max_ms|slow)$/.exec(field);
      return match ? [match[1]] : [];
    }));
    const routes = [...routeNames].map((route) => {
      const routeRequests = aggregate[`route:${route}:requests`] || 0;
      return {
        route, requests: routeRequests,
        average_ms: routeRequests ? Math.round((aggregate[`route:${route}:duration_ms`] || 0) / routeRequests) : 0,
        max_ms: aggregate[`route:${route}:max_ms`] || 0,
        slow_requests: aggregate[`route:${route}:slow`] || 0,
      };
    }).sort((left, right) => right.average_ms - left.average_ms || right.requests - left.requests);
    return {
      from: new Date(now.getTime() - count * 60 * 60 * 1000).toISOString(), to: now.toISOString(), requests,
      average_ms: requests ? Math.round((aggregate.duration_ms || 0) / requests) : 0,
      max_ms: aggregate.max_ms || 0, histogram,
      estimated_p50_ms: this.percentile(histogram, 0.5), estimated_p95_ms: this.percentile(histogram, 0.95), estimated_p99_ms: this.percentile(histogram, 0.99),
      slow_requests: histogram.gte1000, routes,
    };
  }
}

import { PerformanceTelemetryService } from './performance-telemetry.service';
import { RedisService } from '../../database/redis.service';

describe('PerformanceTelemetryService', () => {
  it('aggregates bounded routes with meaningful slow-request percentiles', async () => {
    const redis = new RedisService({ get: jest.fn() } as any);
    const aggregate = jest.spyOn(redis, 'aggregateHash');
    const service = new PerformanceTelemetryService(redis);
    await service.record('/api/resources/259-hd-texture-pack?token=never-store', 200, 50);
    await service.record('/api/resources/260-another', 200, 380);
    await service.record('/api/v1/threads/123', 500, 1500);
    await service.record('/api/health', 200, 1);
    const summary = await service.summary(1);
    expect(aggregate).toHaveBeenCalledTimes(3);
    expect(summary.requests).toBe(3);
    expect(summary.histogram).toEqual({ lt100: 1, lt300: 0, lt1000: 1, gte1000: 1, lt3000: 1, lt10000: 0, lt30000: 0, gte30000: 0 });
    expect(summary.slow_requests).toBe(1);
    expect(summary.estimated_p95_ms).toBe(3000);
    expect(summary.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ route: 'api.resources', requests: 2, average_ms: 215 }),
      expect.objectContaining({ route: 'api.posts', requests: 1, slow_requests: 1 }),
    ]));
    expect(JSON.stringify(summary)).not.toContain('259-hd-texture-pack');
    expect(JSON.stringify(summary)).not.toContain('never-store');
  });

  it('takes maxima across hours and uses observed maximum for legacy and open-ended overflow', async () => {
    const redis = new RedisService({ get: jest.fn() } as any);
    await redis.aggregateHash('performance:requests:2026100310', [['requests', 1], ['duration_ms', 2000], ['histogram:gte1000', 1]], [['max_ms', 2000], ['route:api.posts:max_ms', 2000]], 3600);
    await redis.aggregateHash('performance:requests:2026100311', [['requests', 1], ['duration_ms', 40000], ['histogram:gte1000', 1], ['histogram:gte30000', 1]], [['max_ms', 40000], ['route:api.posts:max_ms', 40000]], 3600);
    const summary = await new PerformanceTelemetryService(redis).summary(2, new Date('2026-10-03T11:20:00Z'));
    expect(summary.max_ms).toBe(40000);
    expect(summary.routes[0].max_ms).toBe(40000);
    expect(summary.estimated_p99_ms).toBe(40000);
  });

  it.each(['/api/v1/resources', '/api/v1/threads', '/api/v1/replies', '/api/v1/admin/users'])(
    'classifies versioned route %s like its legacy equivalent', (route) => {
      const service = new PerformanceTelemetryService({} as any);
      expect(service.routeFor(route)).toBe(service.routeFor(route.replace('/v1', '')));
    },
  );
});

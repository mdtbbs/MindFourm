import { RedisService } from './redis.service';

describe('RedisService lifecycle', () => {
  it('can shut down cleanly when module initialization did not create a client', async () => {
    const service = new RedisService({ get: jest.fn() } as any);
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('provides atomic set-if-absent semantics during a Redis outage', async () => {
    const service = new RedisService({ get: jest.fn() } as any);
    await expect(service.setIfNotExists('resource:view:1:actor:user:7', '1', 60)).resolves.toBe(true);
    await expect(service.setIfNotExists('resource:view:1:actor:user:7', '1', 60)).resolves.toBe(false);
    await expect(service.setIfNotExists('resource:view:1:actor:user:8', '1', 60)).resolves.toBe(true);
  });

  it('consumes a challenge ticket once when Redis is unavailable', async () => {
    const service = new RedisService({ get: jest.fn() } as any);
    await service.set('forum:challenge:ticket', 'payload', 60);
    await expect(service.getAndDelete('forum:challenge:ticket')).resolves.toBe('payload');
    await expect(service.getAndDelete('forum:challenge:ticket')).resolves.toBeNull();
  });

  it('increments bounded risk counters with an expiry in the fallback store', async () => {
    const service = new RedisService({ get: jest.fn() } as any);
    await expect(service.incrementWithExpiry('forum:challenge:risk', 60)).resolves.toBe(1);
    await expect(service.incrementWithExpiry('forum:challenge:risk', 60)).resolves.toBe(2);
  });
});

describe('RedisService telemetry and session fallback', () => {
  it('aggregates concurrent counters without losing maxima in memory', async () => {
    const service = new RedisService({ get: jest.fn() } as any);
    await Promise.all([700, 2400, 100].map((duration) => service.aggregateHash('timings', [['requests', 1], ['duration_ms', duration]], [['max_ms', duration]], 60)));
    expect(await service.hgetall('timings')).toEqual({ requests: '3', duration_ms: '3200', max_ms: '2400' });
    expect(await service.ttl('timings')).toBeGreaterThan(0);
  });

  it('reads revocation every time, only renews an existing session, and preserves fields', async () => {
    const service = new RedisService({ get: jest.fn() } as any);
    expect(await service.readSessionAndRenew('missing', 604800)).toEqual({});
    expect(await service.exists('missing')).toBe(0);
    await service.hset('session:test', 'userId', '7');
    await service.expire('session:test', 600);
    expect(await service.readSessionAndRenew('session:test', 604800)).toEqual({ userId: '7' });
    expect(await service.ttl('session:test')).toBeGreaterThan(604700);
    await service.del('session:test');
    expect(await service.readSessionAndRenew('session:test', 604800)).toEqual({});
  });

  it('counts users once across sessions and exposes observation warmup', async () => {
    const service = new RedisService({ get: jest.fn() } as any);
    const now = Date.now();
    await service.recordUserActivity(7, now);
    await service.recordUserActivity(7, now);
    await service.recordUserActivity(8, now);
    expect(await service.activeUserStats(now)).toEqual({ count: 2, observedSince: new Date(now).toISOString(), complete: false });
  });
});

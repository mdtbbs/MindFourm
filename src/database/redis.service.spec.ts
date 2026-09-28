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

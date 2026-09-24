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
});

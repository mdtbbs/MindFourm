import { RedisService } from './redis.service';

/**
 * These cover the two behaviours that used to disappear during a Redis outage:
 * the rate-limit counter and the MindAuth refresh cooldown.
 */
function createService() {
  const service = new RedisService({ get: jest.fn() } as any);
  const client = {
    eval: jest.fn(),
    set: jest.fn(),
    del: jest.fn().mockResolvedValue(1),
    get: jest.fn(),
  };
  (service as any).client = client;
  (service as any).fallback.start();
  return { service, client, state: service as any };
}

describe('RedisService fixed-window counter', () => {
  it('uses the script and returns the incremented value while Redis is up', async () => {
    const { service, client, state } = createService();
    state.redisAvailable = true;
    client.eval.mockResolvedValue(3);

    await expect(service.incrementFixedWindow('rate_limit:k', 60)).resolves.toBe(3);
    expect(client.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('INCR'"), 1, 'rate_limit:k', 60);
  });

  it('keeps counting in the fallback when Redis fails mid-flight', async () => {
    const { service, client, state } = createService();
    state.redisAvailable = true;
    client.eval.mockRejectedValue(new Error('connection closed'));

    await expect(service.incrementFixedWindow('rate_limit:k', 60)).resolves.toBe(1);
    await expect(service.incrementFixedWindow('rate_limit:k', 60)).resolves.toBe(2);
    expect(state.redisAvailable).toBe(false);
  });

  it('arms the window so the fallback counter can still expire', async () => {
    const { service, state } = createService();
    state.redisAvailable = false;
    const now = jest.spyOn(Date, 'now');

    now.mockReturnValue(1_000);
    await service.incrementFixedWindow('rate_limit:k', 60);
    expect(state.fallback.ttl('rate_limit:k')).toBe(60);

    now.mockReturnValue(1_000 + 61_000);
    await expect(service.incrementFixedWindow('rate_limit:k', 60)).resolves.toBe(1);
    now.mockRestore();
  });
});

describe('RedisService cooldowns', () => {
  it('grants once and refuses while the cooldown is active', async () => {
    const { service, client, state } = createService();
    state.redisAvailable = true;
    client.set.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);

    await expect(service.acquireCooldown('mindauth:user-refresh', 60, '7')).resolves.toBe(true);
    await expect(service.acquireCooldown('mindauth:user-refresh', 60, '7')).resolves.toBe(false);
  });

  it('enforces the cooldown locally even when Redis is unavailable', async () => {
    const { service, state } = createService();
    state.redisAvailable = false;

    await expect(service.acquireCooldown('mindauth:user-refresh', 60, '7')).resolves.toBe(true);
    await expect(service.acquireCooldown('mindauth:user-refresh', 60, '7')).resolves.toBe(false);
    // A different user is unaffected.
    await expect(service.acquireCooldown('mindauth:user-refresh', 60, '8')).resolves.toBe(true);
  });

  it('keeps the gate closed when the Redis write itself fails', async () => {
    const { service, client, state } = createService();
    state.redisAvailable = true;
    client.set.mockRejectedValue(new Error('redis down'));

    await expect(service.acquireCooldown('mindauth:user-refresh', 60, '7')).resolves.toBe(true);
    await expect(service.acquireCooldown('mindauth:user-refresh', 60, '7')).resolves.toBe(false);
  });

  it('reopens after the cooldown expires', async () => {
    const { service, state } = createService();
    state.redisAvailable = false;
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(10_000);

    await expect(service.acquireCooldown('scope', 30, '7')).resolves.toBe(true);
    now.mockReturnValue(10_000 + 31_000);
    await expect(service.acquireCooldown('scope', 30, '7')).resolves.toBe(true);
    now.mockRestore();
  });

  it('allows an immediate retry after an explicit release', async () => {
    const { service, state } = createService();
    state.redisAvailable = false;

    await expect(service.acquireCooldown('scope', 60, '7')).resolves.toBe(true);
    await service.releaseCooldown('scope', '7');
    await expect(service.acquireCooldown('scope', 60, '7')).resolves.toBe(true);
  });
});

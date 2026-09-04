import { PerformanceTelemetryService } from './performance-telemetry.service';

class FakeRedis {
  readonly hashes = new Map<string, Record<string, string>>();
  async hget(key: string, field: string) { return this.hashes.get(key)?.[field] || null; }
  async hset(key: string, field: string, value: string) { const hash = this.hashes.get(key) || {}; hash[field] = value; this.hashes.set(key, hash); return 1; }
  async hIncrBy(key: string, field: string, increment = 1) { const hash = this.hashes.get(key) || {}; hash[field] = String(Number(hash[field] || 0) + increment); this.hashes.set(key, hash); return Number(hash[field]); }
  async hgetall(key: string) { return this.hashes.get(key) || {}; }
  async expire() { return 1; }
}

describe('PerformanceTelemetryService', () => {
  it('aggregates a bounded route baseline without URL identifiers', async () => {
    const service = new PerformanceTelemetryService(new FakeRedis() as any);
    await service.record('/api/resources/259-hd-texture-pack?token=never-store', 200, 50);
    await service.record('/api/resources/260-another', 200, 380);
    await service.record('/api/posts/123', 500, 1500);
    await service.record('/api/health', 200, 1);

    const summary = await service.summary(1);
    expect(summary.requests).toBe(3);
    expect(summary.histogram).toEqual({ lt100: 1, lt300: 0, lt1000: 1, gte1000: 1 });
    expect(summary.slow_requests).toBe(1);
    expect(summary.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ route: 'api.resources', requests: 2, average_ms: 215 }),
      expect.objectContaining({ route: 'api.posts', requests: 1, slow_requests: 1 }),
    ]));
    expect(JSON.stringify(summary)).not.toContain('259-hd-texture-pack');
    expect(JSON.stringify(summary)).not.toContain('never-store');
  });
});

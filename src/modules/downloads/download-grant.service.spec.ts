import { DownloadGrantService } from './download-grant.service';
import { DownloadEvent } from '@entities/download-event.entity';
import { downloadActorKey } from '@common/utils/download-actor.util';


describe('DownloadGrantService persistence and deduplication', () => {
  function setup() {
    const events: any[] = [];
    const dedup = new Map<string, Date>();
    const grants = new Set<string>();
    const counts = new Map<number, number>();
    let transactionTail = Promise.resolve();
    const insert = jest.fn(async (_entity: any, value: any) => {
      if (value.event_type === 'granted') {
        const key = `${value.dedup_key}:${value.dedup_bucket}`;
        if (grants.has(key)) {
          const error: any = new Error('duplicate key'); error.code = 'ER_DUP_ENTRY'; throw error;
        }
        grants.add(key);
      }
      events.push(value);
      return { identifiers: [] };
    });
    // The counter is written with raw SQL on purpose: manager.increment() would
    // append `updated_at = CURRENT_TIMESTAMP` and move the resource's date.
    const manager = {
      insert,
      query: jest.fn(async (sql: string, params: any[]) => {
        const counterMatch = /UPDATE `resources` SET `(\w+)` = `\w+` \+ \? WHERE `id` = \?/.exec(sql);
        if (counterMatch) {
          const id = Number(params[1]);
          counts.set(id, (counts.get(id) || 0) + Number(params[0]));
          return { affectedRows: 1 };
        }
        return { affectedRows: 0 };
      }),
    };
    const dataSource = {
      createQueryRunner: jest.fn(() => {
        let releaseLock: (() => void) | undefined;
        const runner: any = {
          manager,
          connect: jest.fn().mockResolvedValue(undefined),
          startTransaction: jest.fn(async () => {
            const previous = transactionTail;
            transactionTail = new Promise<void>((resolve) => { releaseLock = resolve; });
            await previous;
          }),
          query: jest.fn(async (sql: string, params: any[]) => {
            if (sql.startsWith('INSERT IGNORE')) {
              if (!dedup.has(params[0])) dedup.set(params[0], new Date('1970-01-01T00:00:00.000Z'));
              return { affectedRows: 1 };
            }
            if (sql.startsWith('SELECT last_granted_at')) {
              const [now, key] = params;
              const last = dedup.get(key)!;
              return [{ last_granted_at: last, is_recent: last.getTime() > new Date(now).getTime() - 60_000 ? 1 : 0 }];
            }
            if (sql.startsWith('UPDATE download_grant_dedup')) {
              dedup.set(params[1], new Date(params[0]));
              return { affectedRows: 1 };
            }
            return [];
          }),
          commitTransaction: jest.fn(async () => releaseLock?.()),
          rollbackTransaction: jest.fn(async () => releaseLock?.()),
          release: jest.fn().mockResolvedValue(undefined),
        };
        return runner;
      }),
    };
    return { service: new DownloadGrantService(dataSource as any), manager, events, counts, dedup };
  }

  const record = (userId: number | null, at = new Date('2026-09-24T10:00:00.000Z')) => ({
    resourceId: 7, versionId: 12, fileId: 30, grantedAt: at, userId, clientType: 'game-content',
    platform: null, backend: 'local',
  });

  it('persists requested and granted facts and atomically increments the existing aggregate', async () => {
    const { service, manager, events, counts } = setup();
    await expect(service.recordGrant(record(3), 'user:3')).resolves.toBe(true);
    expect(events.map((event) => event.event_type)).toEqual(['requested', 'granted']);
    const counterCalls = manager.query.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE `resources` SET `download_count`'));
    expect(counterCalls).toHaveLength(1);
    expect(counterCalls[0][1]).toEqual([1, 7]);
    // TypeORM's manager.increment() would append `updated_at = CURRENT_TIMESTAMP`
    // and the download would re-date the resource; counting must not touch it.
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('updated_at'))).toBe(false);
    expect(counts.get(7)).toBe(1);
    expect(events[1].dedup_key).toMatch(/^[a-f0-9]{64}$/);
    expect(events[1].dedup_key).not.toContain('user:3');
  });

  it('deduplicates concurrent retries while allowing other users and anonymous actors', async () => {
    const { service, counts } = setup();
    const same = await Promise.all(Array.from({ length: 12 }, () => service.recordGrant(record(3), 'user:3')));
    expect(same.filter(Boolean)).toHaveLength(1);
    await expect(service.recordGrant(record(4), 'user:4')).resolves.toBe(true);
    await expect(service.recordGrant(record(null), 'anon:ip-hash-a')).resolves.toBe(true);
    await expect(service.recordGrant(record(null), 'anon:ip-hash-b')).resolves.toBe(true);
    expect(counts.get(7)).toBe(4);
  });

  it('uses a new database minute bucket after the dedup window and preserves the legacy aggregate baseline', async () => {
    const { service, counts } = setup();
    const first = record(3);
    await service.recordGrant(first, 'user:3');
    await expect(service.recordGrant(record(3, new Date(first.grantedAt.getTime() + 61_000)), 'user:3')).resolves.toBe(true);
    expect(counts.get(7)).toBe(2);
    expect(service.computeDisplayedCount(900, 2)).toBe(902);
  });
});

describe('DownloadEventsService persistence', () => {
  const completion = (at = new Date('2026-09-24T10:00:00.000Z')) => ({
    event_type: 'completed' as const, resource_id: 1, version_id: 2, file_id: 3,
    user_id: null, client_type: 'game-content' as const, platform: null, backend: 'local', created_at: at,
  });

  it('inserts plain lifecycle events without dedup keys', async () => {
    const repo = { insert: jest.fn().mockResolvedValue(undefined), count: jest.fn() };
    const { DownloadEventsService } = await import('./download-events.service');
    const service = new DownloadEventsService(repo as any);
    await service.recordEvent({ event_type: 'started', resource_id: 1, version_id: 2, file_id: 3, user_id: null, client_type: 'game-content', platform: null, backend: 'local', created_at: new Date() });
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'started', dedup_key: null, dedup_bucket: null }));
    expect(DownloadEvent).toBeDefined();
  });

  it('counts successful stream ends only, never bare grants, for both aggregates', async () => {
    const repo = { insert: jest.fn(), count: jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(5) };
    const { DownloadEventsService } = await import('./download-events.service');
    const service = new DownloadEventsService(repo as any);
    await expect(service.getAggregateCount(3)).resolves.toBe(4);
    await expect(service.getResourceAggregate(1)).resolves.toBe(5);
    expect(repo.count).toHaveBeenNthCalledWith(1, { where: { file_id: 3, event_type: 'completed' } });
    expect(repo.count).toHaveBeenNthCalledWith(2, { where: { resource_id: 1, event_type: 'completed' } });
  });

  it('records a completion once per (file, actor) window and rejects concurrent replays', async () => {
    const seen = new Set<string>();
    // Repository.insert takes a single entity object (unlike manager.insert).
    const insert = jest.fn(async (value: any) => {
      const key = `${value.dedup_key}:${value.dedup_bucket}`;
      if (seen.has(key)) { const error: any = new Error('duplicate key'); error.code = 'ER_DUP_ENTRY'; throw error; }
      seen.add(key);
    });
    const { DownloadEventsService } = await import('./download-events.service');
    const service = new DownloadEventsService({ insert } as any);

    const results = await Promise.all([
      service.recordCompletion(completion(), 'user:7'),
      service.recordCompletion(completion(), 'user:7'),
      service.recordCompletion(completion(), 'user:8'),
    ]);
    expect(results).toEqual([true, false, true]);
    expect(insert.mock.calls[0][0]).toMatchObject({ event_type: 'completed' });
    // The completion namespace never collides with the grant row of the same request.
    expect(String(insert.mock.calls[0][0].dedup_key)).not.toContain('user:7');

    // A later window is a new download and must count again.
    const later = new Date('2026-09-24T10:02:00.000Z');
    await expect(service.recordCompletion(completion(later), 'user:7')).resolves.toBe(true);
  });

  it('deduplicates completions by natural minute, not a rolling 60 seconds', async () => {
    // Documented trade-off (docs/production-deployment.md): the completion bucket
    // is the calendar minute, so an end at 10:00:59 and a retry at 10:01:01 land
    // in different buckets and both count. Replacing the bucket with a rolling
    // window (or reusing grant's lock row) must fail this expectation.
    const buckets = new Map<string, string>();
    const insert = jest.fn(async (value: any) => {
      const seen = `${value.dedup_key}:${value.dedup_bucket}`;
      if (buckets.has(seen)) { const error: any = new Error('duplicate key'); error.code = 'ER_DUP_ENTRY'; throw error; }
      buckets.set(seen, value.dedup_bucket);
    });
    const { DownloadEventsService } = await import('./download-events.service');
    const service = new DownloadEventsService({ insert } as any);

    // Same calendar minute: the second completion is a replay and is rejected.
    const withinMinute = new Date('2026-09-24T10:00:01.000Z');
    await expect(service.recordCompletion(completion(withinMinute), 'user:7')).resolves.toBe(true);
    await expect(service.recordCompletion(completion(new Date('2026-09-24T10:00:59.000Z')), 'user:7')).resolves.toBe(false);

    // Across the minute boundary: a new bucket, so it counts again.
    const nextMinute = new Date('2026-09-24T10:01:01.000Z');
    await expect(service.recordCompletion(completion(nextMinute), 'user:7')).resolves.toBe(true);
    // Completion buckets are calendar minutes since the epoch.
    expect(insert.mock.calls[2][0].dedup_bucket).toBe(String(Math.floor(nextMinute.getTime() / 60_000)));
    expect(insert.mock.calls[0][0].dedup_bucket).not.toBe(insert.mock.calls[2][0].dedup_bucket);
  });

  it('counts one anonymous visitor once across the web and game-content routes', async () => {
    // Both routes funnel through downloadActorKey(), so the same visitor produces
    // the same dedup key even though the web route passes the full header and the
    // game-content route passes the 80-character value it also stores. Deriving
    // either side differently (e.g. an HMAC of the IP alone) must fail this test.
    const seen = new Set<string>();
    const insert = jest.fn(async (value: any) => {
      const key = `${value.dedup_key}:${value.dedup_bucket}`;
      if (seen.has(key)) { const error: any = new Error('duplicate key'); error.code = 'ER_DUP_ENTRY'; throw error; }
      seen.add(key);
    });
    const { DownloadEventsService } = await import('./download-events.service');
    const service = new DownloadEventsService({ insert } as any);

    const fullAgent = `Mozilla/5.0 (${'long'.repeat(40)})`;
    const webKey = downloadActorKey(null, '198.51.100.7', fullAgent);
    const gameKey = downloadActorKey(null, '198.51.100.7', fullAgent.slice(0, 80));
    expect(webKey).toBe(gameKey);

    const results = await Promise.all([
      service.recordCompletion(completion(), webKey),
      service.recordCompletion(completion(), gameKey),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('propagates real insert failures instead of swallowing them as duplicates', async () => {
    const insert = jest.fn().mockRejectedValue(new Error('connection lost'));
    const { DownloadEventsService } = await import('./download-events.service');
    const service = new DownloadEventsService({ insert } as any);
    await expect(service.recordCompletion(completion(), 'user:7')).rejects.toThrow('connection lost');
  });
});

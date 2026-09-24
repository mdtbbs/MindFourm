import { DownloadGrantService } from './download-grant.service';
import { DownloadEvent } from '@entities/download-event.entity';
import { Resource } from '@entities/resource.entity';

describe('DownloadGrantService persistence and deduplication', () => {
  function setup() {
    const events: any[] = [];
    const dedup = new Map<string, Date>();
    const grants = new Set<string>();
    const counts = new Map<number, number>();
    let transactionTail = Promise.resolve();
    const manager = {
      insert: jest.fn(async (_entity: any, value: any) => {
        if (value.event_type === 'granted') {
          const key = `${value.dedup_key}:${value.dedup_bucket}`;
          if (grants.has(key)) {
            const error: any = new Error('duplicate key'); error.code = 'ER_DUP_ENTRY'; throw error;
          }
          grants.add(key);
        }
        events.push(value);
        return { identifiers: [] };
      }),
      increment: jest.fn(async (_entity: any, where: { id: number }) => counts.set(where.id, (counts.get(where.id) || 0) + 1)),
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
    expect(manager.increment).toHaveBeenCalledWith(Resource, { id: 7 }, 'download_count', 1);
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
  it('inserts lifecycle events and queries durable grant counts', async () => {
    const repo = { insert: jest.fn().mockResolvedValue(undefined), count: jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(5) };
    const { DownloadEventsService } = await import('./download-events.service');
    const service = new DownloadEventsService(repo as any);
    await service.recordEvent({ event_type: 'completed', resource_id: 1, version_id: 2, file_id: 3, user_id: null, client_type: 'game-content', platform: null, backend: 'local', created_at: new Date() });
    expect(repo.insert).toHaveBeenCalledWith( expect.objectContaining({ event_type: 'completed', dedup_key: null, dedup_bucket: null }));
    await expect(service.getAggregateCount(3)).resolves.toBe(4);
    await expect(service.getResourceAggregate(1)).resolves.toBe(5);
    expect(repo.count).toHaveBeenNthCalledWith(1, { where: { file_id: 3, event_type: 'granted' } });
    expect(DownloadEvent).toBeDefined();
  });
});

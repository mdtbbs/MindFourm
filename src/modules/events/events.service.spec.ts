import { EventsService } from './events.service';
import { OutboxEvent } from '@entities/outbox-event.entity';

function createWorker() {
  const row: any = { id: 4, event_key: 'Reply', status: 'pending', retry_count: 0, next_attempt_at: null };
  const qb: any = {};
  for (const method of ['where', 'andWhere', 'orderBy', 'take']) qb[method] = jest.fn(() => qb);
  qb.getMany = jest.fn(async () => [row]);
  const repo = {
    createQueryBuilder: jest.fn(() => qb), findOne: jest.fn(async () => row),
    update: jest.fn(async (_id, values) => { Object.assign(row, values); }),
  };
  const locks = new Map<string, string>();
  const redis = {
    set: jest.fn(async (key, owner) => { if (locks.has(key)) return null; locks.set(key, owner); return 'OK'; }),
    get: jest.fn(async (key) => locks.get(key)),
    eval: jest.fn(async (_lua, _count, key, owner) => { if (locks.get(key) !== owner) return 0; locks.delete(key); return 1; }),
  };
  const redisService = { isRedisAvailable: () => true, getClient: () => redis, setIfNotExists: jest.fn() };
  const worker = new EventsService(repo as any, redisService as any);
  return { worker, row, repo, redis, redisService, qb };
}

it('enqueues through the caller transaction repository', async () => {
  const txRepo = { create: jest.fn((data) => data), save: jest.fn(async (data) => ({ id: 7, ...data })) };
  const manager = { getRepository: jest.fn(() => txRepo) };
  const worker = new EventsService({ save: jest.fn() } as any);
  await expect(worker.publish({ eventKey: 'Reply', aggregateType: 'Reply', aggregateId: 9, payload: { reply_id: 9 } }, manager as any))
    .resolves.toMatchObject({ id: 7, status: 'pending' });
  expect(manager.getRepository).toHaveBeenCalledWith(OutboxEvent);
});

it('retries a failed handler after backoff and only marks complete after all effects succeed', async () => {
  const { worker, row, repo, qb, redisService } = createWorker();
  const handler = jest.fn().mockRejectedValueOnce(new Error('mention database unavailable')).mockResolvedValue(undefined);
  worker.register('Reply', handler);
  await worker.processPending();
  expect(row.status).toBe('failed');
  expect(row.retry_count).toBe(1);
  expect(row.last_error).toContain('mention database unavailable');
  expect(row.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
  await worker.processPending();
  expect(handler).toHaveBeenCalledTimes(1);
  row.next_attempt_at = new Date(0);
  await worker.processPending();
  expect(row.status).toBe('processed');
  expect(handler).toHaveBeenCalledTimes(2);
  expect(repo.update).toHaveBeenCalledTimes(2);
  expect(qb.andWhere).toHaveBeenCalledWith('event.event_key IN (:...eventKeys)', { eventKeys: ['Reply'] });
  expect(redisService.setIfNotExists).not.toHaveBeenCalled();
});

it('competing workers cannot handle the same event concurrently', async () => {
  const { worker, repo, redisService } = createWorker();
  const second = new EventsService(repo as any, redisService as any);
  let release!: () => void;
  const handler = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));
  worker.register('Reply', handler);
  second.register('Reply', handler);
  const run = worker.processPending();
  await new Promise((resolve) => setImmediate(resolve));
  await second.processPending();
  expect(handler).toHaveBeenCalledTimes(1);
  release();
  await run;
});

it('does not consume events while Redis is unavailable or silently use a local lease', async () => {
  const { worker, repo, redis, redisService } = createWorker();
  worker.register('Reply', jest.fn());
  redisService.isRedisAvailable = () => false;
  await worker.processPending();
  expect(repo.createQueryBuilder).not.toHaveBeenCalled();
  redisService.isRedisAvailable = () => true;
  redis.set.mockRejectedValueOnce(new Error('Redis disconnected'));
  await expect(worker.processPending()).rejects.toThrow('Redis disconnected');
  expect(redisService.setIfNotExists).not.toHaveBeenCalled();
});


describe('EventsService', () => {
  it('publishes an event to the outbox', async () => {
    const saved = { id: 1, event_key: 'ResourceVersionPublished', status: 'pending' };
    const repo = {
      create: jest.fn().mockReturnValue(saved),
      save: jest.fn().mockResolvedValue(saved),
    };
    const service = new EventsService(repo as any);

    const result = await service.publish({
      eventKey: 'ResourceVersionPublished',
      aggregateType: 'ResourceVersion',
      aggregateId: 42,
      payload: { resource_id: 1, version: '1.0' },
    });

    expect(result).toBe(saved);
    expect(repo.save).toHaveBeenCalled();
  });

  it('fetches pending events ordered by created_at', async () => {
    const events = [{ id: 1, status: 'pending' }, { id: 2, status: 'pending' }];
    const repo = { find: jest.fn().mockResolvedValue(events) };
    const service = new EventsService(repo as any);

    const result = await service.getPendingEvents(10);
    expect(result).toHaveLength(2);
    expect(repo.find).toHaveBeenCalledWith({
      where: { status: 'pending' },
      order: { created_at: 'ASC' },
      take: 10,
    });
  });

  it('marks an event as processed', async () => {
    const repo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const service = new EventsService(repo as any);

    await service.markProcessed(1);
    expect(repo.update).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'processed' }));
  });

  it('marks an event as failed with retry count', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue({ id: 1, retry_count: 2 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const service = new EventsService(repo as any);

    await service.markFailed(1, 'Connection timeout');
    expect(repo.update).toHaveBeenCalledWith(1, expect.objectContaining({
      status: 'failed',
      retry_count: 3,
      last_error: 'Connection timeout',
    }));
  });
});

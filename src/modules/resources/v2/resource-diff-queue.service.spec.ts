import { ResourceDiffQueueService } from './resource-diff-queue.service';

function harness() {
  const items: string[] = [];
  const redis = {
    setIfNotExists: jest.fn().mockResolvedValue(true),
    rpush: jest.fn(async (_key: string, value: string) => { items.push(value); return items.length; }),
    lpop: jest.fn(async () => items.shift() ?? null),
    del: jest.fn().mockResolvedValue(1),
  };
  const visualDiff = { computeAndStore: jest.fn().mockResolvedValue(undefined) };
  return { service: new ResourceDiffQueueService(redis as any, visualDiff as any), redis, visualDiff, items };
}

describe('ResourceDiffQueueService', () => {
  it('deduplicates identical version pairs and pushes one job', async () => {
    const { service, redis, items } = harness();
    await expect(service.enqueue(10, 100, 101)).resolves.toBe(true);
    expect(redis.setIfNotExists).toHaveBeenCalledWith('forum:resource-diff:queued:100:101', '1', 300);
    expect(items).toEqual([JSON.stringify({ resource_id: 10, from_version_id: 100, to_version_id: 101 })]);

    redis.setIfNotExists.mockResolvedValueOnce(false);
    await expect(service.enqueue(10, 100, 101)).resolves.toBe(false);
    expect(items).toHaveLength(1);
  });

  it('drains jobs once, computes them and clears the dedupe marker', async () => {
    const { service, redis, visualDiff, items } = harness();
    await service.enqueue(10, 100, 101);
    await service.enqueue(11, 200, 201);
    await expect(service.drainOnce()).resolves.toBe(2);
    expect(visualDiff.computeAndStore).toHaveBeenNthCalledWith(1, 10, 100, 101);
    expect(visualDiff.computeAndStore).toHaveBeenNthCalledWith(2, 11, 200, 201);
    expect(redis.del).toHaveBeenCalledWith('forum:resource-diff:queued:100:101');
    expect(redis.del).toHaveBeenCalledWith('forum:resource-diff:queued:200:201');
    expect(items).toHaveLength(0);
  });

  it('skips malformed jobs without calling the renderer', async () => {
    const { service, visualDiff, items } = harness();
    items.push('{not json}', JSON.stringify({ resource_id: 'x', from_version_id: 1, to_version_id: 2 }));
    await expect(service.drainOnce()).resolves.toBe(0);
    expect(visualDiff.computeAndStore).not.toHaveBeenCalled();
  });

  it('keeps the queue alive when one computation fails', async () => {
    const { service, redis, visualDiff } = harness();
    visualDiff.computeAndStore.mockRejectedValueOnce(new Error('renderer down'));
    await service.enqueue(10, 100, 101);
    await expect(service.drainOnce()).resolves.toBe(0);
    expect(redis.del).toHaveBeenCalledWith('forum:resource-diff:queued:100:101');
  });
});

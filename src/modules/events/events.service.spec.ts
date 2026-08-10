import { EventsService } from './events.service';

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

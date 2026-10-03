import { PointsService } from './points.service';
import { PointLog } from '@entities/point-log.entity';
import { User } from '@entities/user.entity';

it('locks the recipient before checking the prior award, making outbox retries no-ops', async () => {
  const previous = { id: 9, user_id: 3, action: 'create_reply', target_type: 'reply', target_id: 8 };
  const manager = {
    findOne: jest.fn(async (entity) => entity === User ? { id: 3 } : previous),
    increment: jest.fn(), save: jest.fn(),
  };
  const service = new PointsService({} as any, { findOne: async () => ({ points: 2 }) } as any, {} as any, { transaction: (run: any) => run(manager) } as any);
  await expect(service.awardPoints(3, 'create_reply', 'reply', 8, true)).resolves.toBe(previous);
  expect(manager.findOne.mock.calls[0]).toEqual([User, { where: { id: 3 }, lock: { mode: 'pessimistic_write' } }]);
  expect(manager.findOne.mock.calls[1]).toEqual([PointLog, { where: { user_id: 3, action: 'create_reply', target_type: 'reply', target_id: 8 } }]);
  expect(manager.increment).not.toHaveBeenCalled();
  expect(manager.save).not.toHaveBeenCalled();
});

it('writes balances and the deduplication log in the same transaction on first delivery', async () => {
  const manager = {
    findOne: jest.fn(async (entity) => entity === User ? { id: 3 } : null),
    increment: jest.fn(async () => undefined), save: jest.fn(async () => undefined),
  };
  const service = new PointsService({} as any, { findOne: async () => ({ points: 2 }) } as any, {} as any, { transaction: (run: any) => run(manager) } as any);
  const log = await service.awardPoints(3, 'create_reply', 'reply', 8, true);
  expect(manager.increment).toHaveBeenCalledTimes(2);
  expect(manager.save).toHaveBeenCalledWith(PointLog, expect.objectContaining({ user_id: 3, points_change: 2, target_id: 8 }));
  expect(log?.target_id).toBe(8);
});

import { NotificationsService } from './notifications.service';

function createService() {
  const notificationRepo = { create: jest.fn((data) => ({ id: 7, ...data })), save: jest.fn(async (row) => row), findOne: jest.fn() };
  const userRepo = { find: jest.fn(async () => [{ id: 3 }]), createQueryBuilder: jest.fn() };
  const postRepo = { findOne: jest.fn(async () => ({ id: 8, status: 'published', required_group_id: null })) };
  const redis = { del: jest.fn(async () => 1) };
  const service = new NotificationsService(notificationRepo as any, userRepo as any, postRepo as any, {} as any, {} as any, redis as any, {} as any, {} as any, {} as any, {} as any);
  jest.spyOn(service as any, 'pushToSse').mockResolvedValue(undefined);
  jest.spyOn(service as any, 'sendEmailForNotification').mockResolvedValue(undefined);
  return { service, notificationRepo, userRepo, postRepo, redis };
}

it('strict mentions propagate persistence failure so an outbox worker can retry', async () => {
  const { service } = createService();
  jest.spyOn(service, 'create').mockRejectedValueOnce(new Error('DB down')).mockResolvedValue({ id: 7 } as any);
  await expect(service.notifyMentionedUserIds([3], 8, 2, 'hello', 9, [], true)).rejects.toThrow('DB down');
  await expect(service.notifyMentionedUserIds([3], 8, 2, 'hello', 9, [], true)).resolves.toEqual([{ id: 7 }]);
});

it('stable reply keys return the committed notification and repair cache on retry without emailing again', async () => {
  const { service, notificationRepo, redis } = createService();
  redis.del.mockRejectedValueOnce(new Error('Redis down'));
  await expect(service.create({ user_id: 3, type: 'mention', reply_id: 9, post_id: 8 })).rejects.toThrow('Redis down');
  expect(notificationRepo.create).toHaveBeenCalledWith(expect.objectContaining({ deduplication_key: 'reply:9:mention:3' }));
  notificationRepo.save.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }));
  notificationRepo.findOne.mockResolvedValue({ id: 7, user_id: 3, type: 'mention' });
  await expect(service.create({ user_id: 3, type: 'mention', reply_id: 9, post_id: 8 })).resolves.toMatchObject({ id: 7 });
  expect((service as any).sendEmailForNotification).toHaveBeenCalledTimes(1);
  expect(redis.del).toHaveBeenCalledTimes(2);
});

it('post publish events can deduplicate mentions without changing editor mention defaults', async () => {
  const { service } = createService();
  const create = jest.spyOn(service, 'create').mockResolvedValue({ id: 7 } as any);
  await service.notifyMentionedUserIds([3], 8, 2, 'hello', undefined, [], true, 'post-published:8');
  expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ deduplicationKey: 'post-published:8:mention:3' }));
  await service.notifyMentionedUserIds([3], 8, 2, 'hello');
  expect(create.mock.calls[1][0].deduplicationKey).toBeUndefined();
});

it('group-only mentions and author notifications require recipient membership or staff visibility', async () => {
  const { service, userRepo, postRepo } = createService();
  postRepo.findOne.mockResolvedValue({ id: 8, status: 'published', required_group_id: 5 });
  const qb: any = {};
  for (const method of ['select', 'where', 'andWhere']) qb[method] = jest.fn(() => qb);
  qb.getMany = jest.fn(async () => []);
  userRepo.createQueryBuilder.mockReturnValue(qb);
  const create = jest.spyOn(service, 'create').mockResolvedValue({ id: 7 } as any);
  await expect(service.notifyMentionedUserIds([3], 8, 2, 'private body', 9, [], true)).resolves.toEqual([]);
  await expect(service.canReceivePostNotification(8, 3)).resolves.toBe(false);
  expect(create).not.toHaveBeenCalled();
  const sql = qb.andWhere.mock.calls[0][0];
  expect(sql).toContain('recipient.role IN');
  expect(sql).toContain('group_members');
});

it('legacy username mentions use the same strict retries and block checks as validated JSON identities', async () => {
  const { service } = createService();
  (service as any).userBlocks = { isBlocked: jest.fn(async () => true) };
  const create = jest.spyOn(service, 'create').mockRejectedValue(new Error('DB unavailable'));
  await expect(service.notifyMentionedUsers('@user hello', 8, 2, 9, [], true)).resolves.toEqual([]);
  expect(create).not.toHaveBeenCalled();
  (service as any).userBlocks.isBlocked.mockResolvedValue(false);
  await expect(service.notifyMentionedUsers('@user hello', 8, 2, 9, [], true)).rejects.toThrow('DB unavailable');
});

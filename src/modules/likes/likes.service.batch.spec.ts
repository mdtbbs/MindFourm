import { LikesService } from './likes.service';
import * as batch from '@common/utils/batch-targets.util';

it('reads a whole page in one visibility lookup plus one viewer-like lookup', async () => {
  const visible = jest.spyOn(batch, 'visibleBatchTargets').mockResolvedValue([
    { id: 1, like_count: 4 }, { id: 2, like_count: 9 },
  ]);
  const qb: any = {};
  for (const method of ['select', 'where', 'andWhere']) qb[method] = jest.fn(() => qb);
  qb.getRawMany = jest.fn(async () => [{ id: 2 }]);
  const likes = { createQueryBuilder: jest.fn(() => qb) };
  const service = new LikesService({} as any, likes as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  await expect(service.getForTargets('reply', [1, 2, 3], { id: 7, role: 'user' })).resolves.toEqual({
    1: { liked: false, count: 4 }, 2: { liked: true, count: 9 },
  });
  expect(visible).toHaveBeenCalledTimes(1);
  expect(qb.getRawMany).toHaveBeenCalledTimes(1);
  expect(qb.andWhere).toHaveBeenCalledWith('liked.reply_id IN (:...ids)', { ids: [1, 2] });
  visible.mockRestore();
});

it('anonymous counts never query a viewer-like table', async () => {
  const visible = jest.spyOn(batch, 'visibleBatchTargets').mockResolvedValue([{ id: 1, like_count: 4 }]);
  const likes = { createQueryBuilder: jest.fn() };
  const service = new LikesService(likes as any, likes as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  await expect(service.getForTargets('post', [1])).resolves.toEqual({ 1: { liked: false, count: 4 } });
  expect(likes.createQueryBuilder).not.toHaveBeenCalled();
  visible.mockRestore();
});

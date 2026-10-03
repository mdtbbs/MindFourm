import { AttachmentsService } from './attachments.service';
import * as batch from '@common/utils/batch-targets.util';

it('loads approved metadata in one query and omits storage paths and draft secrets', async () => {
  const visible = jest.spyOn(batch, 'visibleBatchTargets').mockResolvedValue([
    { id: 1, like_count: 0 }, { id: 2, like_count: 0 },
  ]);
  const repo = { find: jest.fn(async () => [{ id: 9, reply_id: 1, file_name: 'map.msav' }]) };
  const service = new AttachmentsService(repo as any, {} as any, {} as any);
  await expect(service.getByReplyIds([1, 2, 3])).resolves.toEqual({
    1: [{ id: 9, reply_id: 1, file_name: 'map.msav' }], 2: [],
  });
  expect(repo.find).toHaveBeenCalledTimes(1);
  const options = repo.find.mock.calls[0][0];
  expect(options.where.status).toBe('approved');
  expect(options.select).not.toContain('file_path');
  expect(options.select).not.toContain('draft_token_hash');
  expect(options.select).not.toContain('user_id');
  visible.mockRestore();
});

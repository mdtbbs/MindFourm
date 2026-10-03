import { BadRequestException } from '@nestjs/common';
import { parseBatchIds, validateBatchIds, visibleBatchTargets } from './batch-targets.util';

function queryBuilder(rows: any[] = []) {
  const builder: any = {};
  for (const method of ['select', 'innerJoin', 'where', 'andWhere']) builder[method] = jest.fn(() => builder);
  builder.getMany = jest.fn(async () => rows);
  return builder;
}

it('rejects malformed/negative/oversized targets before querying', () => {
  for (const text of ['', '0', '-1', '1.2', '1,,2', '1, 2', '9007199254740992']) {
    expect(() => parseBatchIds(text)).toThrow(BadRequestException);
  }
  expect(() => validateBatchIds(Array.from({ length: 101 }, (_, index) => index + 1))).toThrow(BadRequestException);
  expect(parseBatchIds('1,2,1')).toEqual([1, 2]);
});

it('applies reply publication, parent visibility and group membership in one batched query', async () => {
  const builder = queryBuilder([{ id: 1, like_count: 2 }]);
  const repo = { createQueryBuilder: jest.fn(() => builder) };
  await expect(visibleBatchTargets({} as any, repo as any, 'reply', [1, 2], { id: 9, role: 'user' }))
    .resolves.toEqual([{ id: 1, like_count: 2 }]);
  expect(builder.select).toHaveBeenCalledWith(['reply.id', 'reply.like_count']);
  const sql = builder.andWhere.mock.calls.map((call: any[]) => call[0]).join(' ');
  expect(sql).toContain('reply.status =');
  expect(sql).toContain('post.deleted_at IS NULL');
  expect(sql).toContain('parent.deleted_at IS NULL');
  expect(sql).toContain('parent.status =');
  expect(sql).toContain('group_members');
  expect(builder.getMany).toHaveBeenCalledTimes(1);
});

it('never permits anonymous non-public posts or group-restricted targets', async () => {
  const builder = queryBuilder();
  const repo = { createQueryBuilder: () => builder };
  await visibleBatchTargets(repo as any, {} as any, 'post', [1]);
  expect(builder.andWhere).toHaveBeenCalledWith('post.status = :postVisibilityStatus', { postVisibilityStatus: 'published' });
  expect(builder.andWhere).toHaveBeenCalledWith('post.required_group_id IS NULL', undefined);
});

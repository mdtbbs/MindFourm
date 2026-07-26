const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  PrimaryColumn: decorator,
  Column: decorator,
  ManyToOne: decorator,
  OneToMany: decorator,
  ManyToMany: decorator,
  OneToOne: decorator,
  JoinColumn: decorator,
  JoinTable: decorator,
  CreateDateColumn: decorator,
  UpdateDateColumn: decorator,
  DeleteDateColumn: decorator,
  Index: decorator,
  Unique: decorator,
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserBlocksService } from './user-blocks.service';

interface StubBlock {
  id: number;
  blocker_id: number;
  blocked_id: number;
  reason: string | null;
  created_at?: Date;
  blocked?: Record<string, unknown>;
}

interface StubUser {
  id: number;
  role: string;
}

function createService(options: { blocks?: StubBlock[]; users?: StubUser[] } = {}) {
  const blocks: StubBlock[] = options.blocks ? [...options.blocks] : [];
  const users: StubUser[] = options.users ?? [{ id: 2, role: 'user' }];
  let nextId = blocks.reduce((max, block) => Math.max(max, block.id), 0) + 1;

  const find = jest.fn(async ({ where }: { where: { blocker_id: number } }) =>
    blocks.filter((block) => block.blocker_id === where.blocker_id));

  const blockRepo = {
    find,
    findOne: jest.fn(async ({ where }: { where: { blocker_id: number; blocked_id: number } }) =>
      blocks.find(
        (block) =>
          block.blocker_id === where.blocker_id && block.blocked_id === where.blocked_id,
      ) ?? null),
    findAndCount: jest.fn(async ({ where }: { where: { blocker_id: number } }) => {
      const matching = blocks.filter((block) => block.blocker_id === where.blocker_id);
      return [matching, matching.length];
    }),
    create: jest.fn((value: Omit<StubBlock, 'id'>) => ({ ...value })),
    save: jest.fn(async (value: Omit<StubBlock, 'id'>) => {
      const saved = { id: nextId++, ...value };
      blocks.push(saved);
      return saved;
    }),
    delete: jest.fn(async (criteria: { blocker_id: number; blocked_id: number }) => {
      const index = blocks.findIndex(
        (block) =>
          block.blocker_id === criteria.blocker_id && block.blocked_id === criteria.blocked_id,
      );
      if (index === -1) return { affected: 0 };
      blocks.splice(index, 1);
      return { affected: 1 };
    }),
  };

  const userRepo = {
    findOne: jest.fn(async ({ where }: { where: { id: number } }) =>
      users.find((user) => user.id === where.id) ?? null),
  };

  const service = new UserBlocksService(blockRepo as never, userRepo as never);
  return { service, blockRepo, userRepo, find, blocks };
}

describe('UserBlocksService.block', () => {
  it('rejects blocking yourself', async () => {
    const { service } = createService();

    await expect(service.block(1, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports a missing target as not found', async () => {
    const { service } = createService({ users: [] });

    await expect(service.block(1, 99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to block a moderator, so a user cannot opt out of moderation', async () => {
    const { service } = createService({ users: [{ id: 2, role: 'moderator' }] });

    await expect(service.block(1, 2)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to block an admin', async () => {
    const { service } = createService({ users: [{ id: 2, role: 'admin' }] });

    await expect(service.block(1, 2)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to block a super admin', async () => {
    const { service } = createService({ users: [{ id: 2, role: 'super_admin' }] });

    await expect(service.block(1, 2)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('stores the reason on a first block', async () => {
    const { service } = createService();

    const created = await service.block(1, 2, 'spam');

    expect(created).toMatchObject({ blocker_id: 1, blocked_id: 2, reason: 'spam' });
  });

  it('returns the existing block without inserting again when already blocked', async () => {
    const { service, blockRepo } = createService({
      blocks: [{ id: 7, blocker_id: 1, blocked_id: 2, reason: 'spam' }],
    });

    const result = await service.block(1, 2, 'a different reason');

    expect(result.id).toBe(7);
    expect(result.reason).toBe('spam');
    expect(blockRepo.save).not.toHaveBeenCalled();
  });

  it('returns the winning row when a concurrent insert hits the unique constraint', async () => {
    const { service, blockRepo, blocks } = createService();
    blockRepo.save.mockImplementationOnce(async () => {
      // Simulate the racing request having committed between the check and the write.
      blocks.push({ id: 42, blocker_id: 1, blocked_id: 2, reason: null });
      throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    });

    const result = await service.block(1, 2);

    expect(result.id).toBe(42);
  });

  it('propagates a save failure that is not a duplicate key', async () => {
    const { service, blockRepo } = createService();
    blockRepo.save.mockRejectedValueOnce(new Error('db down'));

    await expect(service.block(1, 2)).rejects.toThrow('db down');
  });
});

describe('UserBlocksService.unblock', () => {
  it('removes the block', async () => {
    const { service, blockRepo } = createService({
      blocks: [{ id: 7, blocker_id: 1, blocked_id: 2, reason: null }],
    });

    await service.unblock(1, 2);

    expect(blockRepo.delete).toHaveBeenCalledWith({ blocker_id: 1, blocked_id: 2 });
    await expect(service.isBlocked(1, 2)).resolves.toBe(false);
  });

  it('reports not found when no block existed', async () => {
    const { service } = createService();

    await expect(service.unblock(1, 2)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UserBlocksService.list', () => {
  it('returns page, limit, total and totalPages, and strips private user fields', async () => {
    const { service } = createService({
      blocks: [
        {
          id: 7,
          blocker_id: 1,
          blocked_id: 2,
          reason: 'spam',
          created_at: new Date('2026-01-01T00:00:00Z'),
          blocked: { id: 2, username: 'bob', email: 'bob@example.com' },
        },
      ],
    });

    const page = await service.list(1, 1, 20);

    expect(page.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(page.data[0].user).toEqual({ id: 2, username: 'bob' });
  });

  it('reports at least one page when the list is empty', async () => {
    const { service } = createService();

    const page = await service.list(1, 1, 20);

    expect(page.data).toEqual([]);
    expect(page.pagination.totalPages).toBe(1);
  });

  it('caps an oversized page size instead of honouring it verbatim', async () => {
    const { service } = createService();

    const page = await service.list(1, 1, 5000);

    expect(page.pagination.limit).toBe(50);
  });
});

describe('UserBlocksService.getBlockedIds cache', () => {
  it('returns the blocked ids on the very first call', async () => {
    // Regression guard for the BansService bug: a fire-and-forget refresh makes the
    // first caller read the empty pre-warm value and pass blocked content through.
    const { service } = createService({
      blocks: [{ id: 1, blocker_id: 1, blocked_id: 2, reason: null }],
    });

    await expect(service.getBlockedIds(1)).resolves.toEqual([2]);
  });

  it('issues a single query for concurrent callers', async () => {
    const { service, find } = createService({
      blocks: [{ id: 1, blocker_id: 1, blocked_id: 2, reason: null }],
    });

    const results = await Promise.all([
      service.getBlockedIds(1),
      service.getBlockedIds(1),
      service.getBlockedIds(1),
    ]);

    expect(find).toHaveBeenCalledTimes(1);
    expect(results).toEqual([[2], [2], [2]]);
  });

  it('serves later calls from cache without querying again', async () => {
    const { service, find } = createService({
      blocks: [{ id: 1, blocker_id: 1, blocked_id: 2, reason: null }],
    });

    await service.getBlockedIds(1);
    await service.getBlockedIds(1);

    expect(find).toHaveBeenCalledTimes(1);
  });

  it('re-queries after a block invalidates the cached entry', async () => {
    const { service, find } = createService();

    await service.getBlockedIds(1);
    await service.block(1, 2);

    await expect(service.getBlockedIds(1)).resolves.toEqual([2]);
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('re-queries after an unblock invalidates the cached entry', async () => {
    const { service } = createService({
      blocks: [{ id: 1, blocker_id: 1, blocked_id: 2, reason: null }],
    });

    await expect(service.isBlocked(1, 2)).resolves.toBe(true);
    await service.unblock(1, 2);

    await expect(service.isBlocked(1, 2)).resolves.toBe(false);
  });

  it('caches each blocker separately', async () => {
    const { service } = createService({
      blocks: [
        { id: 1, blocker_id: 1, blocked_id: 2, reason: null },
        { id: 2, blocker_id: 3, blocked_id: 4, reason: null },
      ],
    });

    await expect(service.getBlockedIds(1)).resolves.toEqual([2]);
    await expect(service.getBlockedIds(3)).resolves.toEqual([4]);
  });

  it('keeps serving the previous snapshot when a refresh query fails', async () => {
    const { service, find } = createService({
      blocks: [{ id: 1, blocker_id: 1, blocked_id: 2, reason: null }],
    });
    await service.getBlockedIds(1);

    find.mockRejectedValueOnce(new Error('db down'));
    (service as unknown as { blockedIdsCache: Map<number, { expiry: number }> })
      .blockedIdsCache.get(1)!.expiry = 0; // force a refresh attempt

    // Still reports the block rather than failing open.
    await expect(service.isBlocked(1, 2)).resolves.toBe(true);
  });

  it('surfaces the error when the first ever load fails, rather than failing open', async () => {
    const { service, find } = createService();
    find.mockRejectedValueOnce(new Error('db down'));

    await expect(service.getBlockedIds(1)).rejects.toThrow('db down');
  });

  it('allows a retry after a failed cold load', async () => {
    const { service, find } = createService({
      blocks: [{ id: 1, blocker_id: 1, blocked_id: 2, reason: null }],
    });
    find.mockRejectedValueOnce(new Error('db down'));

    await expect(service.getBlockedIds(1)).rejects.toThrow('db down');
    // The in-flight promise must have been cleared, or every later call would reject.
    await expect(service.getBlockedIds(1)).resolves.toEqual([2]);
  });
});

describe('UserBlocksService.assertNotBlocked', () => {
  it('throws when the recipient has blocked the sender', async () => {
    const { service } = createService({
      blocks: [{ id: 1, blocker_id: 2, blocked_id: 1, reason: null }],
    });

    await expect(service.assertNotBlocked(1, 2)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes when nobody has blocked anybody', async () => {
    const { service } = createService();

    await expect(service.assertNotBlocked(1, 2)).resolves.toBeUndefined();
  });

  it('passes when the sender blocked the recipient but not the other way round', async () => {
    // The direction matters: blocking someone must not stop you writing to them.
    const { service } = createService({
      blocks: [{ id: 1, blocker_id: 1, blocked_id: 2, reason: null }],
    });

    await expect(service.assertNotBlocked(1, 2)).resolves.toBeUndefined();
  });
});

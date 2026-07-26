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

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReactionsService } from './reactions.service';
import { REACTION_EMOJIS } from './reaction-emojis';

const [THUMBS_UP, HEART, LAUGH] = REACTION_EMOJIS;

interface StubReaction {
  id: number;
  user_id: number;
  target_type: string;
  target_id: number;
  emoji: string;
}

function createService(
  options: { reactions?: StubReaction[]; postIds?: number[]; replyIds?: number[] } = {},
) {
  const reactions: StubReaction[] = options.reactions ? [...options.reactions] : [];
  const postIds = options.postIds ?? [10];
  const replyIds = options.replyIds ?? [20];
  let nextId = reactions.reduce((max, row) => Math.max(max, row.id), 0) + 1;

  const getRawMany = jest.fn();
  const createQueryBuilder = jest.fn(() => {
    const params: Record<string, unknown> = {};
    const builder = {
      select: jest.fn(() => builder),
      addSelect: jest.fn(() => builder),
      groupBy: jest.fn(() => builder),
      addGroupBy: jest.fn(() => builder),
      where: jest.fn((_condition: string, values?: Record<string, unknown>) => {
        Object.assign(params, values ?? {});
        return builder;
      }),
      andWhere: jest.fn((_condition: string, values?: Record<string, unknown>) => {
        Object.assign(params, values ?? {});
        return builder;
      }),
      setParameter: jest.fn((key: string, value: unknown) => {
        params[key] = value;
        return builder;
      }),
      getRawMany: jest.fn(async () => {
        getRawMany();
        const targetType = params.targetType as string;
        const targetIds = params.targetIds as number[];
        const viewerId = params.viewerId as number;

        const groups = new Map<string, { target_id: number; emoji: string; count: number; reacted: number }>();
        for (const row of reactions) {
          if (row.target_type !== targetType || !targetIds.includes(row.target_id)) continue;
          const key = `${row.target_id}:${row.emoji}`;
          const group = groups.get(key)
            ?? { target_id: row.target_id, emoji: row.emoji, count: 0, reacted: 0 };
          group.count += 1;
          if (row.user_id === viewerId) group.reacted += 1;
          groups.set(key, group);
        }

        // mysql2 hands COUNT/SUM back as strings, so the stub does too.
        return [...groups.values()].map((group) => ({
          target_id: group.target_id,
          emoji: group.emoji,
          count: String(group.count),
          reacted: String(group.reacted),
        }));
      }),
    };
    return builder;
  });

  const reactionRepo = {
    createQueryBuilder,
    findOne: jest.fn(async ({ where }: { where: StubReaction }) =>
      reactions.find(
        (row) =>
          row.user_id === where.user_id
          && row.target_type === where.target_type
          && row.target_id === where.target_id
          && row.emoji === where.emoji,
      ) ?? null),
    create: jest.fn((value: Omit<StubReaction, 'id'>) => ({ ...value })),
    save: jest.fn(async (value: Omit<StubReaction, 'id'>) => {
      const saved = { id: nextId++, ...value };
      reactions.push(saved);
      return saved;
    }),
    delete: jest.fn(async ({ id }: { id: number }) => {
      const index = reactions.findIndex((row) => row.id === id);
      if (index === -1) return { affected: 0 };
      reactions.splice(index, 1);
      return { affected: 1 };
    }),
  };

  const postRepo = {
    findOne: jest.fn(async ({ where }: { where: { id: number } }) =>
      (postIds.includes(where.id) ? { id: where.id } : null)),
  };
  const replyRepo = {
    findOne: jest.fn(async ({ where }: { where: { id: number } }) =>
      (replyIds.includes(where.id) ? { id: where.id } : null)),
  };

  const service = new ReactionsService(
    reactionRepo as never,
    postRepo as never,
    replyRepo as never,
  );
  return { service, reactionRepo, postRepo, replyRepo, getRawMany, createQueryBuilder, reactions };
}

describe('ReactionsService.toggle validation', () => {
  it('rejects an emoji outside the whitelist', async () => {
    const { service } = createService();

    await expect(service.toggle(1, 'post', 10, '🦄')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an arbitrary string masquerading as an emoji', async () => {
    // Without this the column would accept any user-controlled text and the
    // aggregate would grow one group per distinct value ever submitted.
    const { service } = createService();

    await expect(
      service.toggle(1, 'post', 10, '<img src=x onerror=alert(1)>'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown target type', async () => {
    const { service } = createService();

    await expect(service.toggle(1, 'user', 10, THUMBS_UP)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates the emoji before touching the target', async () => {
    const { service, postRepo } = createService();

    await expect(service.toggle(1, 'post', 10, '🦄')).rejects.toBeInstanceOf(BadRequestException);
    expect(postRepo.findOne).not.toHaveBeenCalled();
  });

  it('reports a missing post as not found', async () => {
    const { service } = createService({ postIds: [] });

    await expect(service.toggle(1, 'post', 10, THUMBS_UP)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports a missing reply as not found', async () => {
    const { service } = createService({ replyIds: [] });

    await expect(service.toggle(1, 'reply', 20, THUMBS_UP)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ReactionsService.toggle', () => {
  it('adds the reaction and reports it as the caller\'s own', async () => {
    const { service } = createService();

    const summary = await service.toggle(1, 'post', 10, THUMBS_UP);

    expect(summary).toEqual([{ emoji: THUMBS_UP, count: 1, reacted: true }]);
  });

  it('returns to no reaction after toggling the same emoji twice', async () => {
    const { service } = createService();

    await service.toggle(1, 'post', 10, THUMBS_UP);
    const summary = await service.toggle(1, 'post', 10, THUMBS_UP);

    expect(summary).toEqual([]);
  });

  it('leaves other users\' reactions in place when one user un-reacts', async () => {
    const { service } = createService({
      reactions: [{ id: 1, user_id: 2, target_type: 'post', target_id: 10, emoji: THUMBS_UP }],
    });

    await service.toggle(1, 'post', 10, THUMBS_UP);
    const summary = await service.toggle(1, 'post', 10, THUMBS_UP);

    expect(summary).toEqual([{ emoji: THUMBS_UP, count: 1, reacted: false }]);
  });

  it('keeps different emoji from the same user independent', async () => {
    const { service } = createService();

    await service.toggle(1, 'post', 10, THUMBS_UP);
    const summary = await service.toggle(1, 'post', 10, HEART);

    expect(summary).toEqual([
      { emoji: THUMBS_UP, count: 1, reacted: true },
      { emoji: HEART, count: 1, reacted: true },
    ]);
  });

  it('treats a unique-constraint collision from a concurrent tap as success', async () => {
    const { service, reactionRepo, reactions } = createService();
    reactionRepo.save.mockImplementationOnce(async () => {
      reactions.push({ id: 99, user_id: 1, target_type: 'post', target_id: 10, emoji: THUMBS_UP });
      throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    });

    const summary = await service.toggle(1, 'post', 10, THUMBS_UP);

    expect(summary).toEqual([{ emoji: THUMBS_UP, count: 1, reacted: true }]);
  });

  it('propagates a save failure that is not a duplicate key', async () => {
    const { service, reactionRepo } = createService();
    reactionRepo.save.mockRejectedValueOnce(new Error('db down'));

    await expect(service.toggle(1, 'post', 10, THUMBS_UP)).rejects.toThrow('db down');
  });

  it('does not confuse a post with a reply of the same id', async () => {
    const { service } = createService({ postIds: [10], replyIds: [10] });

    await service.toggle(1, 'post', 10, THUMBS_UP);
    const replySummary = await service.getForTarget('reply', 10, 1);

    expect(replySummary).toEqual([]);
  });
});

describe('ReactionsService.getForTarget', () => {
  it('sums a count across users in a single aggregate query', async () => {
    const { service, getRawMany } = createService({
      reactions: [
        { id: 1, user_id: 1, target_type: 'post', target_id: 10, emoji: THUMBS_UP },
        { id: 2, user_id: 2, target_type: 'post', target_id: 10, emoji: THUMBS_UP },
        { id: 3, user_id: 3, target_type: 'post', target_id: 10, emoji: HEART },
      ],
    });

    const summary = await service.getForTarget('post', 10);

    expect(summary).toEqual([
      { emoji: THUMBS_UP, count: 2, reacted: false },
      { emoji: HEART, count: 1, reacted: false },
    ]);
    expect(getRawMany).toHaveBeenCalledTimes(1);
  });

  it('marks reacted only for the emoji the given viewer used', async () => {
    const { service } = createService({
      reactions: [
        { id: 1, user_id: 1, target_type: 'post', target_id: 10, emoji: THUMBS_UP },
        { id: 2, user_id: 2, target_type: 'post', target_id: 10, emoji: HEART },
      ],
    });

    await expect(service.getForTarget('post', 10, 1)).resolves.toEqual([
      { emoji: THUMBS_UP, count: 1, reacted: true },
      { emoji: HEART, count: 1, reacted: false },
    ]);
    await expect(service.getForTarget('post', 10, 2)).resolves.toEqual([
      { emoji: THUMBS_UP, count: 1, reacted: false },
      { emoji: HEART, count: 1, reacted: true },
    ]);
  });

  it('reports nothing as reacted for an anonymous viewer', async () => {
    const { service } = createService({
      reactions: [{ id: 1, user_id: 1, target_type: 'post', target_id: 10, emoji: THUMBS_UP }],
    });

    await expect(service.getForTarget('post', 10)).resolves.toEqual([
      { emoji: THUMBS_UP, count: 1, reacted: false },
    ]);
  });

  it('returns an empty list for a target nobody reacted to', async () => {
    const { service } = createService();

    await expect(service.getForTarget('post', 10)).resolves.toEqual([]);
  });

  it('orders emoji by the whitelist rather than by insertion or count', async () => {
    const { service } = createService({
      reactions: [
        { id: 1, user_id: 1, target_type: 'post', target_id: 10, emoji: LAUGH },
        { id: 2, user_id: 2, target_type: 'post', target_id: 10, emoji: LAUGH },
        { id: 3, user_id: 3, target_type: 'post', target_id: 10, emoji: THUMBS_UP },
      ],
    });

    const summary = await service.getForTarget('post', 10);

    expect(summary.map((item) => item.emoji)).toEqual([THUMBS_UP, LAUGH]);
  });

  it('rejects an unknown target type', async () => {
    const { service } = createService();

    await expect(service.getForTarget('user', 10)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ReactionsService.getForTargets', () => {
  it('groups by target id using one aggregate query for the whole page', async () => {
    const { service, getRawMany } = createService({
      reactions: [
        { id: 1, user_id: 1, target_type: 'post', target_id: 10, emoji: THUMBS_UP },
        { id: 2, user_id: 2, target_type: 'post', target_id: 10, emoji: THUMBS_UP },
        { id: 3, user_id: 1, target_type: 'post', target_id: 11, emoji: HEART },
      ],
    });

    const grouped = await service.getForTargets('post', [10, 11, 12]);

    expect(grouped).toEqual({
      10: [{ emoji: THUMBS_UP, count: 2, reacted: false }],
      11: [{ emoji: HEART, count: 1, reacted: false }],
      12: [],
    });
    expect(getRawMany).toHaveBeenCalledTimes(1);
  });

  it('resolves reacted per viewer across the whole batch', async () => {
    const { service } = createService({
      reactions: [
        { id: 1, user_id: 1, target_type: 'post', target_id: 10, emoji: THUMBS_UP },
        { id: 2, user_id: 2, target_type: 'post', target_id: 11, emoji: THUMBS_UP },
      ],
    });

    const grouped = await service.getForTargets('post', [10, 11], 2);

    expect(grouped[10][0].reacted).toBe(false);
    expect(grouped[11][0].reacted).toBe(true);
  });

  it('excludes rows of the other target type', async () => {
    const { service } = createService({
      reactions: [
        { id: 1, user_id: 1, target_type: 'reply', target_id: 10, emoji: THUMBS_UP },
      ],
    });

    await expect(service.getForTargets('post', [10])).resolves.toEqual({ 10: [] });
  });

  it('queries nothing for an empty id list', async () => {
    const { service, createQueryBuilder } = createService();

    await expect(service.getForTargets('post', [])).resolves.toEqual({});
    expect(createQueryBuilder).not.toHaveBeenCalled();
  });

  it('deduplicates repeated ids instead of double counting them', async () => {
    const { service } = createService({
      reactions: [{ id: 1, user_id: 1, target_type: 'post', target_id: 10, emoji: THUMBS_UP }],
    });

    const grouped = await service.getForTargets('post', [10, 10, 10]);

    expect(Object.keys(grouped)).toEqual(['10']);
    expect(grouped[10]).toEqual([{ emoji: THUMBS_UP, count: 1, reacted: false }]);
  });
});

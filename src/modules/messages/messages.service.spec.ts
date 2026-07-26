const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
  In: (values: unknown[]) => ({ _in: values }),
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

jest.mock('@entities/message.entity', () => ({ Message: class Message {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));
jest.mock('@entities/group-chat.entity', () => ({ GroupChat: class GroupChat {} }));
jest.mock('@entities/group-chat-member.entity', () => ({
  GroupChatMember: class GroupChatMember {},
}));
jest.mock('@common/utils/markdown.util', () => ({ parseMarkdown: (v: string) => v }));

import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { MessagesService, normalizeMessageLimit } from './messages.service';

function createService(overrides: Record<string, any> = {}) {
  const messageRepo = {
    findOne: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
    ...overrides.messageRepo,
  };
  const groupChatMemberRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => v),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    ...overrides.groupChatMemberRepo,
  };
  const userBlocksService = {
    assertNotBlocked: jest.fn().mockResolvedValue(undefined),
    ...overrides.userBlocksService,
  };
  const notificationsService = {
    create: jest.fn().mockResolvedValue(undefined),
    ...overrides.notificationsService,
  };
  const service = new MessagesService(
    messageRepo as any,
    { findOne: jest.fn() } as any,
    { findOne: jest.fn(), save: jest.fn() } as any,
    groupChatMemberRepo as any,
    { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() } as any,
    notificationsService as any,
    userBlocksService as any,
    (overrides.dataSource ?? {}) as any,
  );

  return { service, messageRepo, groupChatMemberRepo, userBlocksService, notificationsService };
}

/** Query runner double for the paths that open a transaction. */
function createQueryRunnerMock(recipient: unknown = { id: 2 }) {
  return {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      findOne: jest.fn().mockResolvedValue(recipient),
      save: jest.fn(async (_entity: unknown, value: unknown) => value),
    },
  };
}

describe('normalizeMessageLimit', () => {
  it('falls back to the default for non-numeric input', () => {
    // `?limit=abc` used to reach the query builder as NaN, producing `LIMIT NaN`.
    expect(normalizeMessageLimit('abc')).toBe(50);
    expect(normalizeMessageLimit(undefined)).toBe(50);
    expect(normalizeMessageLimit(null)).toBe(50);
    expect(normalizeMessageLimit('')).toBe(50);
  });

  it('rejects non-positive values', () => {
    expect(normalizeMessageLimit(0)).toBe(50);
    expect(normalizeMessageLimit(-10)).toBe(50);
  });

  it('caps oversized page sizes', () => {
    expect(normalizeMessageLimit(999999)).toBe(100);
    expect(normalizeMessageLimit('100')).toBe(100);
  });

  it('passes sensible values through, truncating fractions', () => {
    expect(normalizeMessageLimit('20')).toBe(20);
    expect(normalizeMessageLimit(7.9)).toBe(7);
  });
});

describe('MessagesService.deleteForUser', () => {
  it('refuses when the caller is neither sender nor recipient', async () => {
    const { service, messageRepo } = createService();
    messageRepo.findOne.mockResolvedValue({ id: 5, sender_id: 1, recipient_id: 2 });

    await expect(service.deleteForUser(5, 99)).rejects.toBeInstanceOf(ForbiddenException);
    expect(messageRepo.update).not.toHaveBeenCalled();
    expect(messageRepo.delete).not.toHaveBeenCalled();
  });

  it('flags the sender side when the sender deletes', async () => {
    const { service, messageRepo } = createService();
    messageRepo.findOne.mockResolvedValue({
      id: 5,
      sender_id: 1,
      recipient_id: 2,
      deleted_by_sender: 0,
      deleted_by_recipient: 0,
    });

    await service.deleteForUser(5, 1);

    expect(messageRepo.update).toHaveBeenCalledWith({ id: 5 }, { deleted_by_sender: 1 });
  });

  it('flags the recipient side when the recipient deletes', async () => {
    const { service, messageRepo } = createService();
    messageRepo.findOne.mockResolvedValue({
      id: 5,
      sender_id: 1,
      recipient_id: 2,
      deleted_by_sender: 0,
      deleted_by_recipient: 0,
    });

    await service.deleteForUser(5, 2);

    expect(messageRepo.update).toHaveBeenCalledWith({ id: 5 }, { deleted_by_recipient: 1 });
  });

  it('hard-deletes only once both sides have removed it', async () => {
    const { service, messageRepo } = createService();
    messageRepo.findOne
      .mockResolvedValueOnce({ id: 5, sender_id: 1, recipient_id: 2 })
      .mockResolvedValueOnce({ id: 5, deleted_by_sender: 1, deleted_by_recipient: 1 });

    await service.deleteForUser(5, 1);

    expect(messageRepo.delete).toHaveBeenCalledWith(5);
  });

  it('reports a missing message rather than silently succeeding', async () => {
    const { service, messageRepo } = createService();
    messageRepo.findOne.mockResolvedValue(null);

    await expect(service.deleteForUser(404, 1)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MessagesService group membership authorization', () => {
  it('refuses addGroupMember for a non-member', async () => {
    const { service, groupChatMemberRepo } = createService();
    groupChatMemberRepo.findOne.mockResolvedValue(null);

    // The original bug: no check at all, so anyone could POST themselves in as
    // "admin" and then read the group's whole history.
    await expect(service.addGroupMember(7, 99, 99, 'admin')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(groupChatMemberRepo.save).not.toHaveBeenCalled();
  });

  it('refuses addGroupMember for a plain member', async () => {
    const { service, groupChatMemberRepo } = createService();
    groupChatMemberRepo.findOne.mockResolvedValue({ role: 'member' });

    await expect(service.addGroupMember(7, 42, 99)).rejects.toBeInstanceOf(ForbiddenException);
    expect(groupChatMemberRepo.save).not.toHaveBeenCalled();
  });

  it('allows a group admin to add a member', async () => {
    const { service, groupChatMemberRepo } = createService();
    groupChatMemberRepo.findOne
      .mockResolvedValueOnce({ role: 'admin' }) // actor lookup
      .mockResolvedValueOnce(null); // target not yet a member

    await service.addGroupMember(7, 1, 99);

    expect(groupChatMemberRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ group_chat_id: 7, user_id: 99, role: 'member' }),
    );
  });

  it('rejects an unknown member role', async () => {
    const { service, groupChatMemberRepo } = createService();
    groupChatMemberRepo.findOne.mockResolvedValue({ role: 'admin' });

    await expect(service.addGroupMember(7, 1, 99, 'owner')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses removeGroupMember for a non-admin', async () => {
    const { service, groupChatMemberRepo } = createService();
    groupChatMemberRepo.findOne.mockResolvedValue({ role: 'member' });

    await expect(service.removeGroupMember(7, 42, 99)).rejects.toBeInstanceOf(ForbiddenException);
    expect(groupChatMemberRepo.delete).not.toHaveBeenCalled();
  });

  it('allows a group admin to remove someone else', async () => {
    const { service, groupChatMemberRepo } = createService();
    groupChatMemberRepo.findOne.mockResolvedValue({ role: 'admin' });

    await service.removeGroupMember(7, 1, 99);

    expect(groupChatMemberRepo.delete).toHaveBeenCalledWith({ group_chat_id: 7, user_id: 99 });
  });

  it('directs an admin removing themselves to the leave flow', async () => {
    const { service, groupChatMemberRepo } = createService();
    groupChatMemberRepo.findOne.mockResolvedValue({ role: 'admin' });

    await expect(service.removeGroupMember(7, 1, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(groupChatMemberRepo.delete).not.toHaveBeenCalled();
  });
});

describe('MessagesService.getGroupMessages pagination', () => {
  function stubQueryBuilder(rows: any[]) {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
  }

  it('returns the oldest timestamp of the page as the next cursor', async () => {
    // Rows arrive newest-first. Reversing before reading the cursor (the old bug)
    // produced the newest timestamp, so the next page repeated this one forever.
    const rows = [
      { id: 3, created_at: new Date('2026-07-03T00:00:00Z') },
      { id: 2, created_at: new Date('2026-07-02T00:00:00Z') },
      { id: 1, created_at: new Date('2026-07-01T00:00:00Z') },
    ];
    const { service, messageRepo, groupChatMemberRepo } = createService();
    groupChatMemberRepo.findOne.mockResolvedValue({ role: 'member' });
    messageRepo.createQueryBuilder.mockReturnValue(stubQueryBuilder(rows));

    const result = await service.getGroupMessages(7, 1, 2);

    expect(result.nextCursor).toBe('2026-07-02T00:00:00.000Z');
    // Display order is oldest-first.
    expect(result.messages.map((m: any) => m.id)).toEqual([2, 3]);
  });

  it('returns a null cursor on the last page', async () => {
    const rows = [{ id: 1, created_at: new Date('2026-07-01T00:00:00Z') }];
    const { service, messageRepo, groupChatMemberRepo } = createService();
    groupChatMemberRepo.findOne.mockResolvedValue({ role: 'member' });
    messageRepo.createQueryBuilder.mockReturnValue(stubQueryBuilder(rows));

    const result = await service.getGroupMessages(7, 1, 50);

    expect(result.nextCursor).toBeNull();
  });

  it('refuses to list messages for a non-member', async () => {
    const { service, groupChatMemberRepo } = createService();
    groupChatMemberRepo.findOne.mockResolvedValue(null);

    await expect(service.getGroupMessages(7, 99, 50)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('MessagesService.create block enforcement', () => {
  it('refuses a direct message when the recipient has blocked the sender', async () => {
    const queryRunner = createQueryRunnerMock();
    const { service, userBlocksService } = createService({
      dataSource: { createQueryRunner: () => queryRunner },
      userBlocksService: {
        assertNotBlocked: jest.fn().mockRejectedValue(new ForbiddenException('blocked')),
      },
    });

    await expect(service.create({ recipient_id: 2, content: 'hi' }, 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // Checked with (sender, recipient) so that the block only stops the blocked
    // direction, and checked before the insert rather than after it.
    expect(userBlocksService.assertNotBlocked).toHaveBeenCalledWith(1, 2);
    expect(queryRunner.manager.save).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it('stores the message when no block is in place', async () => {
    const queryRunner = createQueryRunnerMock();
    const { service } = createService({
      dataSource: { createQueryRunner: () => queryRunner },
    });

    await service.create({ recipient_id: 2, content: 'hi' }, 1);

    expect(queryRunner.manager.save).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });
});

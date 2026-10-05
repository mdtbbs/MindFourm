import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResourcesV2WriteService } from './resources-v2-write.service';

const resourcePublicId = '10000000-0000-4000-8000-000000000001';

function createHarness(ownerId = 10, invites: Array<{ userId: number; fromUserId: number; status?: string }> = []) {
  const members = new Map<number, { role: string; status: string; invited_by_user_id: number | null }>();
  members.set(ownerId, { role: 'owner', status: 'active', invited_by_user_id: null });
  for (const invite of invites) members.set(invite.userId, {
    role: 'owner', status: invite.status || 'invited', invited_by_user_id: invite.fromUserId,
  });
  let currentOwnerId = ownerId;
  const queries: Array<{ sql: string; parameters: any[] }> = [];
  const manager: any = {
    query: jest.fn(async (sql: string, parameters: any[] = []) => {
      queries.push({ sql, parameters });
      if (sql.includes('FROM resources WHERE public_id=?')) {
        return [{ id: 7, public_id: resourcePublicId, user_id: currentOwnerId }];
      }
      if (sql.includes('FROM resource_members WHERE resource_id = ? AND user_id = ?')) {
        const member = members.get(Number(parameters[1]));
        return member ? [{ ...member }] : [];
      }
      if (sql.includes('FROM users u') && sql.includes('LEFT JOIN resource_members rm')) {
        const member = members.get(Number(parameters[1]));
        return [{ account_role: 'user', member_role: member?.status === 'active' ? member.role : null }];
      }
      if (sql.startsWith("UPDATE resource_members SET status='revoked'")) {
        const exceptUserId = sql.includes('user_id<>?') ? Number(parameters[1]) : null;
        for (const [userId, member] of members) {
          if (member.role === 'owner' && member.status === 'invited' && userId !== exceptUserId) member.status = 'revoked';
        }
        return { affectedRows: 1 };
      }
      if (sql.startsWith("UPDATE resource_members SET role='owner'")) {
        const member = members.get(Number(parameters[1]));
        if (member) { member.role = 'owner'; member.status = 'active'; }
        return { affectedRows: 1 };
      }
      if (sql.startsWith('INSERT INTO resource_members')) {
        const userId = Number(parameters[1]);
        const role = sql.includes("'maintainer','active'") ? 'maintainer' : 'owner';
        const status = sql.includes("'maintainer','active'") ? 'active' : 'invited';
        members.set(userId, { role, status, invited_by_user_id: parameters[2] == null ? null : Number(parameters[2]) });
        return { affectedRows: 1 };
      }
      if (sql.includes('SET status = ?')) {
        const member = members.get(Number(parameters[3]));
        if (member) member.status = String(parameters[0]);
        return { affectedRows: 1 };
      }
      return { affectedRows: 1 };
    }),
    create: jest.fn((_entity: unknown, value: any) => value),
    save: jest.fn(async (_entity: unknown, value: any) => value),
    update: jest.fn(async (_entity: unknown, _id: number, value: any) => { currentOwnerId = Number(value.user_id); }),
  };
  const dataSource: any = { transaction: jest.fn((callback: (manager: any) => Promise<unknown>) => callback(manager)) };
  const users: any = {
    findOne: jest.fn(async ({ where }: any) => {
      const usersByName: Record<string, number> = { A: 10, B: 20, C: 30 };
      return usersByName[where.username] ? { id: usersByName[where.username], username: where.username } : null;
    }),
  };
  const service = new ResourcesV2WriteService(dataSource, {} as any, users, {} as any, {} as any);
  return { service, manager, dataSource, members, queries, get ownerId() { return currentOwnerId; } };
}

describe('ResourcesV2WriteService ownership transfer', () => {
  it('revokes every older owner invitation before issuing the new transfer', async () => {
    const harness = createHarness(10, [{ userId: 20, fromUserId: 10 }]);

    await harness.service.beginOwnershipTransfer(resourcePublicId, 'C', 10);

    expect(harness.manager.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE resource_members SET status='revoked'"), [7],
    );
    expect(harness.members.get(20)).toMatchObject({ status: 'revoked' });
    expect(harness.members.get(30)).toMatchObject({ role: 'owner', status: 'invited', invited_by_user_id: 10 });
    expect(harness.manager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event_type: 'ownership_transfer_started',
    }));
  });

  it('binds a transfer to the current owner and revokes competing invitations on acceptance', async () => {
    const harness = createHarness(10, [
      { userId: 20, fromUserId: 10 },
      { userId: 30, fromUserId: 10 },
    ]);

    await harness.service.respondToInvitation(resourcePublicId, true, 20);

    expect(harness.ownerId).toBe(20);
    expect(harness.members.get(10)).toMatchObject({ role: 'maintainer', status: 'active' });
    expect(harness.members.get(20)).toMatchObject({ role: 'owner', status: 'active' });
    expect(harness.members.get(30)).toMatchObject({ role: 'owner', status: 'revoked' });
    expect(harness.manager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event_type: 'ownership_transfer_completed', result: 'accepted',
    }));
    expect(harness.manager.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [resourcePublicId]);
    expect(harness.manager.query).toHaveBeenCalledWith(expect.stringContaining('FROM resource_members'), [7, 20]);
  });

  it('commits invalidation of a stale invite and returns a client error', async () => {
    const harness = createHarness(20, [{ userId: 30, fromUserId: 10 }]);

    await expect(harness.service.respondToInvitation(resourcePublicId, true, 30))
      .rejects.toBeInstanceOf(ConflictException);

    expect(harness.members.get(30)).toMatchObject({ status: 'revoked' });
    expect(harness.manager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event_type: 'ownership_transfer_stale', result: 'revoked',
    }));
  });

  it.each([
    ['B', 'C', 20, 30],
    ['C', 'B', 30, 20],
  ])('makes only the most recent invite valid when transfer order is %s then %s', async (first, second, oldId, winnerId) => {
    const harness = createHarness();
    await harness.service.beginOwnershipTransfer(resourcePublicId, first, 10);
    await harness.service.beginOwnershipTransfer(resourcePublicId, second, 10);

    await expect(harness.service.respondToInvitation(resourcePublicId, true, oldId as number))
      .rejects.toBeInstanceOf(NotFoundException);
    await harness.service.respondToInvitation(resourcePublicId, true, winnerId as number);
    expect(harness.ownerId).toBe(winnerId);
  });

  it('lets admins initiate a transfer while binding acceptance to the canonical current owner', async () => {
    const harness = createHarness(10);

    await harness.service.beginOwnershipTransfer(resourcePublicId, 'B', 99, true);

    expect(harness.members.get(20)).toMatchObject({ role: 'owner', status: 'invited', invited_by_user_id: 10 });
    expect(harness.manager.query).toHaveBeenCalledWith(expect.stringContaining("'resource.owner.transfer.start'"), [99, 7, expect.any(String)]);
  });

  it('allows only the current locked owner to grant a maintainer invitation', async () => {
    const harness = createHarness();

    await expect(harness.service.inviteMember(resourcePublicId, 'B', 'maintainer', 10))
      .resolves.toMatchObject({ role: 'maintainer', status: 'invited' });
    expect(harness.manager.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [resourcePublicId]);
  });

  it('does not use a former owner role snapshot to invite another maintainer after transfer', async () => {
    const harness = createHarness();
    await harness.service.beginOwnershipTransfer(resourcePublicId, 'B', 10);
    await harness.service.respondToInvitation(resourcePublicId, true, 20);
    const memberInvitesBefore = harness.queries.filter(({ sql }) => sql.startsWith('INSERT INTO resource_members')).length;

    await expect(harness.service.inviteMember(resourcePublicId, 'C', 'maintainer', 10))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(harness.ownerId).toBe(20);
    expect(harness.manager.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [resourcePublicId]);
    expect(harness.queries.filter(({ sql }) => sql.startsWith('INSERT INTO resource_members'))).toHaveLength(memberInvitesBefore);
  });
});

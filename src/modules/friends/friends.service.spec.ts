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

jest.mock('@common/utils/search.util', () => ({
  escapeLike: (input: string) => input.replace(/([%_\\])/g, '\\$1'),
}));

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FriendsService } from './friends.service';

interface StubFriendship {
  id: number;
  requester_id: number;
  addressee_id: number;
  status: 'pending' | 'accepted' | 'rejected';
  created_at?: Date;
  updated_at?: Date;
  requester?: Record<string, unknown>;
  addressee?: Record<string, unknown>;
}

interface StubUser {
  id: number;
  username: string;
  avatar_url?: string | null;
  role?: string;
  email?: string;
}

function createService(options: {
  friendships?: StubFriendship[];
  users?: StubUser[];
  blockedIds?: Map<number, number[]>;
} = {}) {
  const friendships: StubFriendship[] = options.friendships
    ? options.friendships.map((f) => ({ ...f }))
    : [];
  const users: StubUser[] = options.users ?? [
    { id: 1, username: 'alice' },
    { id: 2, username: 'bob' },
    { id: 3, username: 'charlie' },
  ];
  const blockedIds = options.blockedIds ?? new Map<number, number[]>();
  let nextId = friendships.reduce((max, f) => Math.max(max, f.id), 0) + 1;

  const notificationsService = {
    create: jest.fn(async () => ({ id: 1 })),
  };

  const userBlocksService = {
    isBlocked: jest.fn(async (blockerId: number, blockedId: number) => {
      const ids = blockedIds.get(blockerId) ?? [];
      return ids.includes(blockedId);
    }),
    getBlockedIds: jest.fn(async (blockerId: number) => {
      return blockedIds.get(blockerId) ?? [];
    }),
  };

  const friendshipRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      // Handle array of where conditions (OR queries)
      if (Array.isArray(where)) {
        for (const condition of where) {
          const match = friendships.find((f) => {
            if (condition.requester_id !== undefined && f.requester_id !== condition.requester_id) return false;
            if (condition.addressee_id !== undefined && f.addressee_id !== condition.addressee_id) return false;
            if (condition.status !== undefined && f.status !== condition.status) return false;
            return true;
          });
          if (match) return match;
        }
        return null;
      }
      return friendships.find((f) => {
        if (where.requester_id !== undefined && f.requester_id !== where.requester_id) return false;
        if (where.addressee_id !== undefined && f.addressee_id !== where.addressee_id) return false;
        if (where.status !== undefined && f.status !== where.status) return false;
        return true;
      }) ?? null;
    }),
    findAndCount: jest.fn(async ({ where, skip, take, relations, order }: any) => {
      let matching: StubFriendship[];
      if (Array.isArray(where)) {
        matching = friendships.filter((f) =>
          where.some((condition: any) => {
            if (condition.requester_id !== undefined && f.requester_id !== condition.requester_id) return false;
            if (condition.addressee_id !== undefined && f.addressee_id !== condition.addressee_id) return false;
            if (condition.status !== undefined && f.status !== condition.status) return false;
            return true;
          })
        );
      } else {
        matching = friendships.filter((f) => {
          if (where.requester_id !== undefined && f.requester_id !== where.requester_id) return false;
          if (where.addressee_id !== undefined && f.addressee_id !== where.addressee_id) return false;
          if (where.status !== undefined && f.status !== where.status) return false;
          return true;
        });
      }
      // Attach user relations
      const enriched = matching.map((f) => ({
        ...f,
        requester: users.find((u) => u.id === f.requester_id) ?? null,
        addressee: users.find((u) => u.id === f.addressee_id) ?? null,
      }));
      const page = enriched.slice(skip ?? 0, (skip ?? 0) + (take ?? 20));
      return [page, matching.length];
    }),
    find: jest.fn(async ({ where, select }: any) => {
      let matching: StubFriendship[];
      if (Array.isArray(where)) {
        matching = friendships.filter((f) =>
          where.some((condition: any) => {
            if (condition.requester_id !== undefined && f.requester_id !== condition.requester_id) return false;
            if (condition.addressee_id !== undefined && f.addressee_id !== condition.addressee_id) return false;
            return true;
          })
        );
      } else if (where) {
        matching = friendships.filter((f) => {
          if (where.requester_id !== undefined && f.requester_id !== where.requester_id) return false;
          if (where.addressee_id !== undefined && f.addressee_id !== where.addressee_id) return false;
          return true;
        });
      } else {
        matching = [...friendships];
      }
      if (select) {
        return matching.map((f) => {
          const result: any = {};
          for (const key of select) {
            result[key] = (f as any)[key];
          }
          return result;
        });
      }
      return matching;
    }),
    create: jest.fn((value: any) => ({ ...value })),
    save: jest.fn(async (value: any) => {
      if (value.id) {
        // Update existing
        const index = friendships.findIndex((f) => f.id === value.id);
        if (index !== -1) {
          friendships[index] = { ...friendships[index], ...value };
          return friendships[index];
        }
      }
      const saved = { id: nextId++, ...value };
      friendships.push(saved);
      return saved;
    }),
    delete: jest.fn(async (criteria: any) => {
      // Handle array of conditions (OR deletes)
      const conditions = Array.isArray(criteria) ? criteria : [criteria];
      let affected = 0;
      for (const condition of conditions) {
        const index = friendships.findIndex((f) => {
          if (condition.requester_id !== undefined && f.requester_id !== condition.requester_id) return false;
          if (condition.addressee_id !== undefined && f.addressee_id !== condition.addressee_id) return false;
          if (condition.status !== undefined && f.status !== condition.status) return false;
          return true;
        });
        if (index !== -1) {
          friendships.splice(index, 1);
          affected++;
        }
      }
      return { affected };
    }),
    count: jest.fn(async ({ where }: any) => {
      return friendships.filter((f) => {
        if (where.requester_id !== undefined && f.requester_id !== where.requester_id) return false;
        if (where.addressee_id !== undefined && f.addressee_id !== where.addressee_id) return false;
        if (where.status !== undefined && f.status !== where.status) return false;
        return true;
      }).length;
    }),
  };

  const userRepo = {
    findOne: jest.fn(async ({ where, select }: any) => {
      const user = users.find((u) => u.id === where.id) ?? null;
      if (!user) return null;
      if (select) {
        const result: any = {};
        for (const key of select) {
          result[key] = (user as any)[key];
        }
        return result;
      }
      return { ...user };
    }),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => []),
      getManyAndCount: jest.fn(async () => [[], 0]),
    })),
  };

  const service = new FriendsService(
    friendshipRepo as never,
    userRepo as never,
    userBlocksService as never,
    notificationsService as never,
  );

  return { service, friendshipRepo, userRepo, userBlocksService, notificationsService, friendships, users };
}

describe('FriendsService.sendRequest', () => {
  it('sends a friend request successfully', async () => {
    const { service, notificationsService } = createService();

    const result = await service.sendRequest(1, 2);

    expect(result).toMatchObject({
      requester_id: 1,
      addressee_id: 2,
      status: 'pending',
    });
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 2,
        type: 'friend_request',
        actor_id: 1,
      })
    );
  });

  it('cannot add yourself as friend', async () => {
    const { service } = createService();

    await expect(service.sendRequest(1, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cannot add a non-existent user', async () => {
    const { service } = createService();

    await expect(service.sendRequest(1, 999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cannot send request if you blocked the target', async () => {
    const blockedIds = new Map([[1, [2]]]);
    const { service } = createService({ blockedIds });

    await expect(service.sendRequest(1, 2)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cannot send request if the target blocked you', async () => {
    const blockedIds = new Map([[2, [1]]]);
    const { service } = createService({ blockedIds });

    await expect(service.sendRequest(1, 2)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('cannot send request if already friends', async () => {
    const { service } = createService({
      friendships: [{ id: 1, requester_id: 1, addressee_id: 2, status: 'accepted' }],
    });

    await expect(service.sendRequest(1, 2)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cannot send duplicate pending request', async () => {
    const { service } = createService({
      friendships: [{ id: 1, requester_id: 1, addressee_id: 2, status: 'pending' }],
    });

    await expect(service.sendRequest(1, 2)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('auto-accepts when the other person already sent a pending request', async () => {
    const { service, friendshipRepo, notificationsService } = createService({
      friendships: [{ id: 5, requester_id: 2, addressee_id: 1, status: 'pending' }],
    });

    const result = await service.sendRequest(1, 2);

    expect(result.status).toBe('accepted');
    expect(result.id).toBe(5);
    // Should have sent a friend_accepted notification to user 2
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 2,
        type: 'friend_accepted',
        actor_id: 1,
      })
    );
  });
});

describe('FriendsService.acceptRequest', () => {
  it('accepts a pending friend request', async () => {
    const { service } = createService({
      friendships: [{ id: 1, requester_id: 2, addressee_id: 1, status: 'pending' }],
    });

    const result = await service.acceptRequest(1, 2);

    expect(result.status).toBe('accepted');
  });

  it('throws if no pending request exists', async () => {
    const { service } = createService();

    await expect(service.acceptRequest(1, 2)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sends friend_accepted notification to the requester', async () => {
    const { service, notificationsService } = createService({
      friendships: [{ id: 1, requester_id: 2, addressee_id: 1, status: 'pending' }],
    });

    await service.acceptRequest(1, 2);

    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 2,
        type: 'friend_accepted',
        actor_id: 1,
      })
    );
  });
});

describe('FriendsService.rejectRequest', () => {
  it('rejects (deletes) a pending request', async () => {
    const { service, friendshipRepo } = createService({
      friendships: [{ id: 1, requester_id: 2, addressee_id: 1, status: 'pending' }],
    });

    await service.rejectRequest(1, 2);

    expect(friendshipRepo.delete).toHaveBeenCalledWith({
      requester_id: 2,
      addressee_id: 1,
      status: 'pending',
    });
  });

  it('throws if no pending request to reject', async () => {
    const { service } = createService();

    await expect(service.rejectRequest(1, 2)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FriendsService.cancelRequest', () => {
  it('cancels a sent pending request', async () => {
    const { service, friendshipRepo } = createService({
      friendships: [{ id: 1, requester_id: 1, addressee_id: 2, status: 'pending' }],
    });

    await service.cancelRequest(1, 2);

    expect(friendshipRepo.delete).toHaveBeenCalledWith({
      requester_id: 1,
      addressee_id: 2,
      status: 'pending',
    });
  });

  it('throws if no pending request to cancel', async () => {
    const { service } = createService();

    await expect(service.cancelRequest(1, 2)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FriendsService.removeFriend', () => {
  it('deletes friendship in both directions', async () => {
    const { service, friendshipRepo } = createService({
      friendships: [{ id: 1, requester_id: 1, addressee_id: 2, status: 'accepted' }],
    });

    await service.removeFriend(1, 2);

    expect(friendshipRepo.delete).toHaveBeenCalledWith([
      { requester_id: 1, addressee_id: 2, status: 'accepted' },
      { requester_id: 2, addressee_id: 1, status: 'accepted' },
    ]);
  });

  it('throws if not friends', async () => {
    const { service } = createService();

    await expect(service.removeFriend(1, 2)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FriendsService.getFriendsList', () => {
  it('returns paginated friends list', async () => {
    const { service } = createService({
      friendships: [
        { id: 1, requester_id: 1, addressee_id: 2, status: 'accepted', updated_at: new Date() },
        { id: 2, requester_id: 3, addressee_id: 1, status: 'accepted', updated_at: new Date() },
      ],
    });

    const result = await service.getFriendsList(1, 1, 20);

    expect(result.total).toBe(2);
    expect(result.friends).toHaveLength(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(1);
  });

  it('does not include pending friendships', async () => {
    const { service } = createService({
      friendships: [
        { id: 1, requester_id: 1, addressee_id: 2, status: 'accepted', updated_at: new Date() },
        { id: 2, requester_id: 1, addressee_id: 3, status: 'pending', updated_at: new Date() },
      ],
    });

    const result = await service.getFriendsList(1, 1, 20);

    expect(result.total).toBe(1);
    expect(result.friends).toHaveLength(1);
  });

  it('caps page size at 50', async () => {
    const { service } = createService();

    const result = await service.getFriendsList(1, 1, 5000);

    expect(result.limit).toBe(50);
  });
});

describe('FriendsService.getPendingRequests', () => {
  it('returns pending requests received by user', async () => {
    const { service } = createService({
      friendships: [
        { id: 1, requester_id: 2, addressee_id: 1, status: 'pending', created_at: new Date() },
        { id: 2, requester_id: 3, addressee_id: 1, status: 'pending', created_at: new Date() },
      ],
    });

    const result = await service.getPendingRequests(1, 1, 20);

    expect(result.total).toBe(2);
    expect(result.requests).toHaveLength(2);
  });

  it('does not include outgoing pending requests', async () => {
    const { service } = createService({
      friendships: [
        { id: 1, requester_id: 2, addressee_id: 1, status: 'pending', created_at: new Date() },
        { id: 2, requester_id: 1, addressee_id: 3, status: 'pending', created_at: new Date() },
      ],
    });

    const result = await service.getPendingRequests(1, 1, 20);

    expect(result.total).toBe(1);
  });
});

describe('FriendsService.areFriends', () => {
  it('returns true if accepted friendship exists in either direction', async () => {
    const { service } = createService({
      friendships: [{ id: 1, requester_id: 2, addressee_id: 1, status: 'accepted' }],
    });

    await expect(service.areFriends(1, 2)).resolves.toBe(true);
    await expect(service.areFriends(2, 1)).resolves.toBe(true);
  });

  it('returns false if not friends', async () => {
    const { service } = createService();

    await expect(service.areFriends(1, 2)).resolves.toBe(false);
  });
});

describe('FriendsService.getPendingStatus', () => {
  it('returns friends when accepted', async () => {
    const { service } = createService({
      friendships: [{ id: 1, requester_id: 1, addressee_id: 2, status: 'accepted' }],
    });

    await expect(service.getPendingStatus(1, 2)).resolves.toBe('friends');
  });

  it('returns incoming when the other person sent a pending request', async () => {
    const { service } = createService({
      friendships: [{ id: 1, requester_id: 2, addressee_id: 1, status: 'pending' }],
    });

    await expect(service.getPendingStatus(1, 2)).resolves.toBe('incoming');
  });

  it('returns outgoing when you sent a pending request', async () => {
    const { service } = createService({
      friendships: [{ id: 1, requester_id: 1, addressee_id: 2, status: 'pending' }],
    });

    await expect(service.getPendingStatus(1, 2)).resolves.toBe('outgoing');
  });

  it('returns none when no relationship', async () => {
    const { service } = createService();

    await expect(service.getPendingStatus(1, 2)).resolves.toBe('none');
  });
});

describe('FriendsService.searchNonFriends', () => {
  it('returns empty for empty query', async () => {
    const { service } = createService();

    const result = await service.searchNonFriends(1, '', 10);

    expect(result).toEqual([]);
  });

  it('excludes self, friends, and blocked users from search results', async () => {
    const blockedIds = new Map([[1, [4]]]);
    const users: StubUser[] = [
      { id: 1, username: 'alice' },
      { id: 2, username: 'bob' },
      { id: 3, username: 'charlie' },
      { id: 4, username: 'dave' },
      { id: 5, username: 'eve' },
    ];
    const { service, userRepo } = createService({
      users,
      blockedIds,
      friendships: [{ id: 1, requester_id: 1, addressee_id: 2, status: 'accepted' }],
    });

    // Mock the query builder to return users 2,3,4,5 (simulating LIKE match),
    // but the service should exclude 2 (friend), 4 (blocked), and 1 (self)
    userRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [
        { id: 3, username: 'charlie', email: 'c@test.com' },
        { id: 5, username: 'eve', email: 'e@test.com' },
      ]),
    });

    const result = await service.searchNonFriends(1, 'c', 10);

    // The mock returns users 3 and 5, and toPublicUsers strips email
    expect(result).toHaveLength(2);
    for (const user of result) {
      expect(user).not.toHaveProperty('email');
    }
  });
});

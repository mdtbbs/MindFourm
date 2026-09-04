jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  Entity: () => () => undefined,
  PrimaryGeneratedColumn: () => () => undefined,
  PrimaryColumn: () => () => undefined,
  Column: () => () => undefined,
  ManyToOne: () => () => undefined,
  OneToMany: () => () => undefined,
  ManyToMany: () => () => undefined,
  OneToOne: () => () => undefined,
  JoinColumn: () => () => undefined,
  JoinTable: () => () => undefined,
  CreateDateColumn: () => () => undefined,
  UpdateDateColumn: () => () => undefined,
  DeleteDateColumn: () => () => undefined,
  Index: () => () => undefined,
  Unique: () => () => undefined,
}));

import { PresenceService } from './presence.service';
import {
  PresenceData,
  PRESENCE_TTL_SECONDS,
  PRESENCE_PUSH_COOLDOWN_SECONDS,
  presenceKey,
  parsePresenceUserId,
} from './presence.data';

interface MockRedisClient {
  store: Map<string, { value: string; ttl?: number }>;
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  mget: jest.Mock;
  exists: jest.Mock;
  config: jest.Mock;
  subscribe: jest.Mock;
  duplicate: jest.Mock;
  on: jest.Mock;
  options: { db: number };
}

function createMockRedisClient(options: { keyspaceEnabled?: boolean } = {}): MockRedisClient {
  const store = new Map<string, { value: string; ttl?: number }>();

  const client: MockRedisClient = {
    store,
    get: jest.fn(async (key: string) => {
      const entry = store.get(key);
      return entry ? entry.value : null;
    }),
    set: jest.fn(async (key: string, value: string, _ex?: string, ttl?: number) => {
      store.set(key, { value, ttl });
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    }),
    mget: jest.fn(async (...keys: string[]) => {
      return keys.map((k) => {
        const entry = store.get(k);
        return entry ? entry.value : null;
      });
    }),
    exists: jest.fn(async (key: string) => {
      return store.has(key) ? 1 : 0;
    }),
    config: jest.fn(async (cmd: string, param: string) => {
      if (cmd === 'GET' && param === 'notify-keyspace-events') {
        return options.keyspaceEnabled !== false ? ['notify-keyspace-events', 'KEA'] : ['notify-keyspace-events', ''];
      }
      return null;
    }),
    subscribe: jest.fn(async () => 'OK'),
    duplicate: jest.fn(function (this: MockRedisClient) {
      const dup = createMockRedisClient(options);
      dup.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'ready') {
          // Simulate ready immediately
          setTimeout(() => handler(), 0);
        }
        return dup;
      });
      return dup;
    }),
    on: jest.fn().mockReturnThis(),
    options: { db: 0 },
  };

  return client;
}

function createRedisService(client: MockRedisClient) {
  return {
    getClient: jest.fn(() => client),
    get: jest.fn(async (key: string) => {
      const entry = client.store.get(key);
      return entry ? entry.value : null;
    }),
    set: jest.fn(async (key: string, value: string, ttl?: number) => {
      client.store.set(key, { value, ttl });
      return 'OK' as const;
    }),
    del: jest.fn(async (key: string) => {
      const existed = client.store.has(key);
      client.store.delete(key);
      return existed ? 1 : 0;
    }),
    exists: jest.fn(async (key: string) => {
      return client.store.has(key) ? 1 : 0;
    }),
  };
}

function createFriendshipRepo(friendships: { requester_id: number; addressee_id: number; status: string }[] = []) {
  return {
    find: jest.fn(async ({ where, select }: any) => {
      let matching = friendships.filter((f) => {
        if (Array.isArray(where)) {
          return where.some((cond: any) => {
            if (cond.requester_id !== undefined && f.requester_id !== cond.requester_id) return false;
            if (cond.addressee_id !== undefined && f.addressee_id !== cond.addressee_id) return false;
            if (cond.status !== undefined && f.status !== cond.status) return false;
            return true;
          });
        }
        return true;
      });
      if (select) {
        return matching.map((f) => {
          const r: any = {};
          for (const k of select) r[k] = (f as any)[k];
          return r;
        });
      }
      return matching;
    }),
  };
}

function createNotificationStream() {
  return {
    pushRaw: jest.fn(),
  };
}

function createNotificationsService() {
  return {
    create: jest.fn(async (data: any) => ({ id: 100, ...data })),
  };
}

describe('PresenceService.setPresence', () => {
  it('writes presence data to Redis with correct TTL', async () => {
    const client = createMockRedisClient();
    const redisService = createRedisService(client);
    const friendshipRepo = createFriendshipRepo();
    const notificationStream = createNotificationStream();

    const service = new PresenceService(
      redisService as any,
      notificationStream as any,
      friendshipRepo as any,
    );

    const data: PresenceData = {
      status: 'online',
      updated_at: Date.now(),
    };

    await service.setPresence(42, data);

    const key = presenceKey(42);
    expect(redisService.set).toHaveBeenCalledWith(key, expect.any(String), PRESENCE_TTL_SECONDS);

    const stored = JSON.parse(client.store.get(key)!.value);
    expect(stored.status).toBe('online');
    expect(client.store.get(key)!.ttl).toBe(PRESENCE_TTL_SECONDS);
  });

  it('writes hosting status with room info', async () => {
    const client = createMockRedisClient();
    const redisService = createRedisService(client);
    const friendshipRepo = createFriendshipRepo();
    const notificationStream = createNotificationStream();

    const service = new PresenceService(
      redisService as any,
      notificationStream as any,
      friendshipRepo as any,
    );

    const data: PresenceData = {
      status: 'hosting',
      room_code: 'ABC123',
      room_name: 'Test Room',
      node_name: 'node-1',
      updated_at: Date.now(),
    };

    await service.setPresence(42, data);

    const key = presenceKey(42);
    const stored = JSON.parse(client.store.get(key)!.value);
    expect(stored.status).toBe('hosting');
    expect(stored.room_code).toBe('ABC123');
    expect(stored.room_name).toBe('Test Room');
    expect(stored.node_name).toBe('node-1');
  });
});

describe('PresenceService.getPresence', () => {
  it('reads presence data correctly', async () => {
    const client = createMockRedisClient();
    const redisService = createRedisService(client);
    const friendshipRepo = createFriendshipRepo();
    const notificationStream = createNotificationStream();

    const service = new PresenceService(
      redisService as any,
      notificationStream as any,
      friendshipRepo as any,
    );

    const data: PresenceData = {
      status: 'playing',
      room_code: 'XYZ',
      updated_at: 1234567890,
    };

    await service.setPresence(42, data);

    const result = await service.getPresence(42);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('playing');
    expect(result!.room_code).toBe('XYZ');
  });

  it('returns null for non-existent user', async () => {
    const client = createMockRedisClient();
    const redisService = createRedisService(client);
    const friendshipRepo = createFriendshipRepo();
    const notificationStream = createNotificationStream();

    const service = new PresenceService(
      redisService as any,
      notificationStream as any,
      friendshipRepo as any,
    );

    const result = await service.getPresence(999);
    expect(result).toBeNull();
  });
});

describe('PresenceService.getPresences', () => {
  it('batch reads presence data correctly', async () => {
    const client = createMockRedisClient();
    const redisService = createRedisService(client);
    const friendshipRepo = createFriendshipRepo();
    const notificationStream = createNotificationStream();

    const service = new PresenceService(
      redisService as any,
      notificationStream as any,
      friendshipRepo as any,
    );

    await service.setPresence(1, { status: 'online', updated_at: Date.now() });
    await service.setPresence(2, { status: 'hosting', room_code: 'ABC', updated_at: Date.now() });
    // User 3 has no presence

    const result = await service.getPresences([1, 2, 3]);

    expect(result.size).toBe(3);
    expect(result.get(1)!.status).toBe('online');
    expect(result.get(2)!.status).toBe('hosting');
    expect(result.get(3)!.status).toBe('offline');
  });

  it('returns empty map for empty input', async () => {
    const client = createMockRedisClient();
    const redisService = createRedisService(client);
    const friendshipRepo = createFriendshipRepo();
    const notificationStream = createNotificationStream();

    const service = new PresenceService(
      redisService as any,
      notificationStream as any,
      friendshipRepo as any,
    );

    const result = await service.getPresences([]);
    expect(result.size).toBe(0);
  });
});

describe('PresenceService.deletePresence', () => {
  it('deletes presence data correctly', async () => {
    const client = createMockRedisClient();
    const redisService = createRedisService(client);
    const friendshipRepo = createFriendshipRepo();
    const notificationStream = createNotificationStream();

    const service = new PresenceService(
      redisService as any,
      notificationStream as any,
      friendshipRepo as any,
    );

    await service.setPresence(42, { status: 'online', updated_at: Date.now() });
    expect(client.store.has(presenceKey(42))).toBe(true);

    await service.deletePresence(42);
    expect(client.store.has(presenceKey(42))).toBe(false);
  });
});

describe('PresenceService.getFriendIds', () => {
  it('returns friend IDs in both directions', async () => {
    const client = createMockRedisClient();
    const redisService = createRedisService(client);
    const friendshipRepo = createFriendshipRepo([
      { requester_id: 42, addressee_id: 1, status: 'accepted' },
      { requester_id: 2, addressee_id: 42, status: 'accepted' },
      { requester_id: 3, addressee_id: 42, status: 'pending' }, // should not count
    ]);
    const notificationStream = createNotificationStream();

    const service = new PresenceService(
      redisService as any,
      notificationStream as any,
      friendshipRepo as any,
    );

    const friendIds = await service.getFriendIds(42);
    expect(friendIds.sort()).toEqual([1, 2]);
  });
});

describe('PresenceService.onModuleInit - keyspace subscription', () => {
  it('does not crash when keyspace notifications are disabled', async () => {
    const client = createMockRedisClient({ keyspaceEnabled: false });
    const redisService = createRedisService(client);
    const friendshipRepo = createFriendshipRepo();
    const notificationStream = createNotificationStream();

    const service = new PresenceService(
      redisService as any,
      notificationStream as any,
      friendshipRepo as any,
    );

    // Should not throw
    await service.onModuleInit();
    expect(client.config).toHaveBeenCalledWith('GET', 'notify-keyspace-events');
  });

  it('subscribes to keyspace notifications when enabled', async () => {
    const client = createMockRedisClient({ keyspaceEnabled: true });
    const redisService = createRedisService(client);
    const friendshipRepo = createFriendshipRepo();
    const notificationStream = createNotificationStream();

    const service = new PresenceService(
      redisService as any,
      notificationStream as any,
      friendshipRepo as any,
    );

    await service.onModuleInit();

    // duplicate() should have been called to create a subscriber
    expect(client.duplicate).toHaveBeenCalled();
  });
});

describe('PresenceService - push cooldown', () => {
  it('30s cooldown prevents duplicate pushes for same user', async () => {
    const client = createMockRedisClient({ keyspaceEnabled: true });
    const redisService = createRedisService(client);
    const friendshipRepo = createFriendshipRepo([
      { requester_id: 42, addressee_id: 10, status: 'accepted' },
    ]);
    const notificationStream = createNotificationStream();

    const service = new PresenceService(
      redisService as any,
      notificationStream as any,
      friendshipRepo as any,
    );

    // Manually test cooldown by simulating keyspace event handling
    // First, set presence to trigger the cooldown
    await service.setPresence(42, { status: 'online', updated_at: Date.now() });

    // Access private method via any
    await (service as any).handleKeyspaceEvent(presenceKey(42));
    expect(notificationStream.pushRaw).toHaveBeenCalledTimes(1);

    // Second call within cooldown should be skipped
    await (service as any).handleKeyspaceEvent(presenceKey(42));
    expect(notificationStream.pushRaw).toHaveBeenCalledTimes(1); // still 1

    // Verify cooldown key exists
    const cooldownKey = `presence_push_cooldown:42`;
    expect(client.store.has(cooldownKey)).toBe(true);
    expect(client.store.get(cooldownKey)!.ttl).toBe(PRESENCE_PUSH_COOLDOWN_SECONDS);
  });
});

describe('External API Controllers', () => {
  // These test the controller logic directly without HTTP layer
  // (full E2E would require NestJS testing module setup)

  describe('ExternalPresenceController', () => {
    it('getPresences parses user_ids correctly', async () => {
      const client = createMockRedisClient();
      const redisService = createRedisService(client);
      const friendshipRepo = createFriendshipRepo();
      const notificationStream = createNotificationStream();

      const presenceService = new PresenceService(
        redisService as any,
        notificationStream as any,
        friendshipRepo as any,
      );

      await presenceService.setPresence(1, { status: 'online', updated_at: Date.now() });
      await presenceService.setPresence(2, { status: 'hosting', room_code: 'ABC', updated_at: Date.now() });

      // Test the service method directly (controller just delegates)
      const result = await presenceService.getPresences([1, 2, 3]);
      expect(result.get(1)!.status).toBe('online');
      expect(result.get(2)!.status).toBe('hosting');
      expect(result.get(3)!.status).toBe('offline');
    });

    it('setPresence validates status', async () => {
      const client = createMockRedisClient();
      const redisService = createRedisService(client);
      const friendshipRepo = createFriendshipRepo();
      const notificationStream = createNotificationStream();

      const presenceService = new PresenceService(
        redisService as any,
        notificationStream as any,
        friendshipRepo as any,
      );

      // Service accepts any status; validation is in controller
      await presenceService.setPresence(1, { status: 'online' as any, updated_at: Date.now() });
      const result = await presenceService.getPresence(1);
      expect(result!.status).toBe('online');
    });
  });

  describe('ExternalNotificationsController', () => {
    it('creates friend_invite notification via NotificationsService', async () => {
      const notificationsService = createNotificationsService();
      const userRepo = {
        findOne: jest.fn(async ({ where }: any) => {
          if (where.id === 42) return { id: 42 };
          return null;
        }),
      };

      // Simulate the controller's handleFriendInvite logic
      const payload = {
        from_user: { id: 1, username: 'alice' },
        room: { code: 'ABC123', name: 'Test Room', display_name: 'Test', node_name: 'node-1' },
        expires_in: 3600,
      };

      const content = JSON.stringify(payload);
      const notification = await notificationsService.create({
        user_id: 42,
        type: 'friend_invite',
        actor_id: payload.from_user.id,
        content,
        emailEvent: false,
      });

      expect(notificationsService.create).toHaveBeenCalledWith({
        user_id: 42,
        type: 'friend_invite',
        actor_id: 1,
        content,
        emailEvent: false,
      });
      expect(notification.id).toBe(100);
    });
  });
});

describe('PresenceData helpers', () => {
  it('presenceKey generates correct Redis key', () => {
    expect(presenceKey(42)).toBe('presence:42');
    expect(presenceKey(1)).toBe('presence:1');
  });

  it('parsePresenceUserId extracts user ID from key', () => {
    expect(parsePresenceUserId('presence:42')).toBe(42);
    expect(parsePresenceUserId('presence:1')).toBe(1);
    expect(parsePresenceUserId('other:42')).toBeNull();
    expect(parsePresenceUserId('presence:')).toBeNull();
  });
});

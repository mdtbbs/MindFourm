import { PresenceConnectionsService } from './presence-connections.service';

describe('PresenceConnectionsService', () => {
  it('aggregates multiple client connections and takes the latest activity', async () => {
    const records = new Map([
      ['web-1', JSON.stringify({ connection_id: 'web-1', user_id: 7, client_id: 'web-app', platform: 'web', created_at: 1, last_seen_at: 20 })],
      ['launcher-1', JSON.stringify({ connection_id: 'launcher-1', user_id: 7, client_id: 'launcher-app', platform: 'launcher', created_at: 2, last_seen_at: 30 })],
    ]);
    const activities = new Map([
      ['activity:conn:web-1', JSON.stringify({ type: 'playing', name: 'Mindustry', updated_at: 100, client_id: 'spoofed' })],
      ['activity:conn:launcher-1', JSON.stringify({ type: 'launcher', name: 'Library', updated_at: 200 })],
    ]);
    const redis = {
      hgetallMany: jest.fn().mockResolvedValue([{ 'web-1': 'index', 'launcher-1': 'index' }]),
      mget: jest.fn(async (...keys: string[]) => keys.map((key) => key.startsWith('presence:conn:')
        ? records.get(key.slice('presence:conn:'.length)) || null : activities.get(key) || null)),
      hdel: jest.fn(),
    };
    const privacy = { statusForMany: jest.fn().mockResolvedValue(new Map([[7, 'online']])) };
    const preferences = { findBy: jest.fn().mockResolvedValue([{ user_id: 7, last_seen_at: null }]) };
    const service = new PresenceConnectionsService(
      redis as any, privacy as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, preferences as any,
    );

    const snapshot = (await service.getSnapshots([7])).get(7);

    expect(snapshot?.status).toBe('online');
    expect(snapshot?.activity).toMatchObject({ type: 'launcher', name: 'Library', client_id: 'launcher-app', platform: 'launcher' });
    expect(snapshot?.activity?.client_id).not.toBe('spoofed');
    expect(redis.mget).toHaveBeenCalledTimes(2);
  });

  it('shows invisible users as offline while their live connection remains active', async () => {
    const redis = {
      hgetallMany: jest.fn().mockResolvedValue([{ 'web-1': 'index' }]),
      mget: jest.fn(async (...keys: string[]) => keys.map((key) => key.startsWith('presence:conn:')
        ? JSON.stringify({ connection_id: 'web-1', user_id: 7, client_id: 'client', platform: 'web', last_seen_at: 20 })
        : JSON.stringify({ type: 'playing', name: 'Mindustry', updated_at: 10 }))),
      hdel: jest.fn(),
    };
    const privacy = { statusForMany: jest.fn().mockResolvedValue(new Map([[7, 'invisible']])) };
    const preferences = { findBy: jest.fn().mockResolvedValue([{ user_id: 7, last_seen_at: null }]) };
    const service = new PresenceConnectionsService(
      redis as any, privacy as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, preferences as any,
    );

    const snapshot = (await service.getSnapshots([7])).get(7);

    expect(snapshot).toMatchObject({ status: 'offline', activity: null });
    expect(redis.hdel).not.toHaveBeenCalled();
  });

  it('validates Activity Session membership and refreshes legacy presence on activity changes', async () => {
    const service = Object.create(PresenceConnectionsService.prototype) as any;
    const connection = { connection_id: 'launcher-1', client_id: 'approved-launcher', platform: 'launcher' };
    service.requireEnabled = jest.fn().mockResolvedValue(undefined);
    service.requireConnection = jest.fn().mockResolvedValue(connection);
    service.multiplayer = {
      assertThirdPartyClientCapability: jest.fn().mockResolvedValue(undefined),
      validateActivitySession: jest.fn().mockResolvedValue({ current_players: 3 }),
    };
    service.redis = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
    service.syncLegacyPresence = jest.fn().mockResolvedValue(undefined);
    service.emitToFriends = jest.fn().mockResolvedValue(undefined);

    await service.putActivity(7, 'launcher-1', {
      type: 'playing', name: 'Mindustry', game: { id: 'mindustry', version: 'v8' },
      party: { current: 3, max: 8 }, join: { session_id: 'ses_12345678901234567890' },
    }, true);
    expect(service.multiplayer.validateActivitySession).toHaveBeenCalledWith(7, 'ses_12345678901234567890');
    expect(service.syncLegacyPresence).toHaveBeenCalledWith(7);

    service.syncLegacyPresence.mockClear();
    await service.deleteActivity(7, 'launcher-1');
    expect(service.syncLegacyPresence).toHaveBeenCalledWith(7);
    expect(service.redis.del).toHaveBeenCalledWith('activity:conn:launcher-1');
  });
});

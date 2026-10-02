import { createHmac } from 'crypto';
import { MultiplayerService } from './multiplayer.service';

describe('MultiplayerService control-plane guards', () => {
  it('binds one-time Join Intents to the owner and consumes them atomically', async () => {
    const service = Object.create(MultiplayerService.prototype) as any;
    const payload = JSON.stringify({ user_id: 7, session_id: 'ses_12345678901234567890', approved_join: true });
    service.redis = {
      get: jest.fn().mockResolvedValue(`7:${payload}`),
      getAndDeleteIfMatches: jest.fn().mockResolvedValue(`7:${payload}`),
    };
    service.joinRequests = { findOneBy: jest.fn().mockResolvedValue(null) };
    service.joinIntents = { findOneBy: jest.fn().mockResolvedValue(null) };
    service.joinSession = jest.fn().mockResolvedValue({ peer: { id: 'peer' } });

    await expect(service.consumeJoinIntent(8, 'launcher', 'jnt_x')).rejects.toMatchObject({ status: 403 });
    expect(service.redis.getAndDeleteIfMatches).not.toHaveBeenCalled();
    const result = await service.consumeJoinIntent(7, 'launcher', 'jnt_x', { udp: true });

    expect(result).toEqual({ peer: { id: 'peer' } });
    expect(service.redis.getAndDeleteIfMatches).toHaveBeenCalledWith('multiplayer:join-intent:jnt_x', '7:');
    expect(service.joinSession).toHaveBeenCalledWith(7, 'launcher', 'ses_12345678901234567890', { capabilities: { udp: true } }, true);
  });

  it('shares a candidate only after authenticating the active peer and bounds metadata', async () => {
    const service = Object.create(MultiplayerService.prototype) as any;
    service.requireEnabled = jest.fn().mockResolvedValue(undefined);
    service.requireActivePeer = jest.fn().mockResolvedValue({ id: 'peer_owner' });
    service.redis = { hgetall: jest.fn().mockResolvedValue({}), hset: jest.fn(), expire: jest.fn() };
    service.realtime = { emitSession: jest.fn().mockResolvedValue(null) };

    await expect(service.addCandidate(7, 'ses_12345678901234567890', {
      kind: 'public', transport: 'udp', address: '8.8.8.8', port: 41000, metadata: { huge: 'x'.repeat(1200) },
    })).rejects.toMatchObject({ status: 400 });
    expect(service.redis.hset).not.toHaveBeenCalled();

    const created = await service.addCandidate(7, 'ses_12345678901234567890', {
      kind: 'public', transport: 'udp', address: '8.8.8.8', port: 41000, metadata: { family: 'ipv4' },
    });
    expect(created.expires_in).toBe(90);
    expect(service.redis.hset).toHaveBeenCalledWith(expect.stringContaining('multiplayer:candidates:'), created.candidate_id, expect.stringContaining('8.8.8.8'));
    expect(service.realtime.emitSession).toHaveBeenCalledWith('ses_12345678901234567890', 'candidate.created', expect.objectContaining({ peer_id: 'peer_owner' }));
  });

  it('denies joining a blocked owner before evaluating visibility or friendship', async () => {
    const service = Object.create(MultiplayerService.prototype) as any;
    service.sessionPolicy = { joinDenialCode: jest.fn().mockResolvedValue('USER_BLOCKED') };

    await expect(service.assertCanJoin(7, { id: 'ses_x', owner_user_id: 9, visibility: 'friends', join_policy: 'open' }, false))
      .rejects.toMatchObject({ status: 403 });
    expect(service.sessionPolicy.joinDenialCode).toHaveBeenCalledWith(7,
      { id: 'ses_x', owner_user_id: 9, visibility: 'friends', join_policy: 'open' },
      { viaInviteOrApproval: false, viaJoinCode: false });
  });

  it('reserves one official Relay slot and signs a short credential without user secrets', async () => {
    const secret = 's'.repeat(48);
    const agent = {
      agent_id: 'official-eu-1', endpoint: 'wss://relay.example.test:41000/relay/v1', region: 'eu',
      capacity: 10, active_allocations: 0, capabilities: {}, last_heartbeat_at: Date.now(),
    };
    const service = Object.create(MultiplayerService.prototype) as any;
    service.requireEnabled = jest.fn().mockResolvedValue(undefined);
    service.findActiveSession = jest.fn().mockResolvedValue({ id: 'ses_12345678901234567890' });
    service.requireActivePeer = jest.fn().mockResolvedValue({ id: 'peer_1' });
    service.redis = {
      scanKeys: jest.fn().mockResolvedValue(['multiplayer:relay:agent:official-eu-1']),
      get: jest.fn().mockResolvedValue(JSON.stringify(agent)),
      set: jest.fn().mockResolvedValue('OK'),
      setIfNotExists: jest.fn().mockResolvedValue(true),
      getAndDeleteIfMatches: jest.fn().mockResolvedValue('lock'),
    };
    service.relayAllocations = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(2),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    service.config = { get: jest.fn().mockReturnValue(secret) };
    service.realtime = { emitSession: jest.fn().mockResolvedValue(null) };

    const result = await service.allocateRelay(7, 'ses_12345678901234567890');
    const [payloadText, signature] = result.credential.split('.');
    const payload = JSON.parse(Buffer.from(payloadText, 'base64url').toString('utf8'));
    const expectedSignature = createHmac('sha256', secret).update(payloadText).digest('base64url');

    expect(result).toMatchObject({ agent_id: 'official-eu-1', endpoint: agent.endpoint, expires_in: 120 });
    expect(signature).toBe(expectedSignature);
    expect(payload).toMatchObject({
      relay_session_id: result.allocation_id,
      session_id: 'ses_12345678901234567890',
      peer_id: 'peer_1',
      agent_id: 'official-eu-1',
    });
    expect(Object.keys(payload).sort()).toEqual(['agent_id', 'expiry', 'peer_id', 'relay_session_id', 'session_id']);
    expect(service.relayAllocations.save).toHaveBeenCalledWith(expect.objectContaining({
      status: 'active', peer_id: 'peer_1', connection_id: null, connected_at: null,
    }));
    expect(service.realtime.emitSession).toHaveBeenCalledWith('ses_12345678901234567890', 'relay.allocated', expect.any(Object));
  });

  it('limits a peer to one live Relay allocation', async () => {
    const service = Object.create(MultiplayerService.prototype) as any;
    service.requireEnabled = jest.fn().mockResolvedValue(undefined);
    service.findActiveSession = jest.fn().mockResolvedValue({ id: 'ses_12345678901234567890' });
    service.requireActivePeer = jest.fn().mockResolvedValue({ id: 'peer_1' });
    service.config = { get: jest.fn().mockReturnValue('s'.repeat(48)) };
    service.redis = {
      scanKeys: jest.fn().mockResolvedValue([]),
      setIfNotExists: jest.fn().mockResolvedValue(true),
      getAndDeleteIfMatches: jest.fn().mockResolvedValue('lock'),
    };
    service.relayAllocations = { findOne: jest.fn().mockResolvedValue({ id: 'rly_existing' }) };
    service.relayAllocations.find = jest.fn().mockResolvedValue([]);

    await expect(service.allocateRelay(7, 'ses_12345678901234567890')).rejects.toMatchObject({ status: 429 });
  });

  it('pins every live allocation in a Session to the same WSS Agent', async () => {
    const stickyAgent = {
      agent_id: 'official-eu-1', endpoint: 'wss://relay-eu.example.test:443/relay/v1', region: 'eu',
      capacity: 10, active_allocations: 1, capabilities: {}, last_heartbeat_at: Date.now(),
    };
    const otherAgent = {
      agent_id: 'official-us-1', endpoint: 'wss://relay-us.example.test:443/relay/v1', region: 'us',
      capacity: 10, active_allocations: 0, capabilities: {}, last_heartbeat_at: Date.now(),
    };
    const service = Object.create(MultiplayerService.prototype) as any;
    service.requireEnabled = jest.fn().mockResolvedValue(undefined);
    service.findActiveSession = jest.fn().mockResolvedValue({ id: 'ses_12345678901234567890' });
    service.requireActivePeer = jest.fn().mockResolvedValue({ id: 'peer_2' });
    service.redis = {
      scanKeys: jest.fn().mockResolvedValue([
        'multiplayer:relay:agent:official-eu-1', 'multiplayer:relay:agent:official-us-1',
      ]),
      get: jest.fn(async (key: string) => key.endsWith('official-eu-1') ? JSON.stringify(stickyAgent) : JSON.stringify(otherAgent)),
      set: jest.fn().mockResolvedValue('OK'),
      setIfNotExists: jest.fn().mockResolvedValue(true),
      getAndDeleteIfMatches: jest.fn().mockResolvedValue('lock'),
    };
    service.relayAllocations = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([{
        id: 'rly_owner', session_id: 'ses_12345678901234567890', peer_id: 'peer_1',
        agent_id: 'official-eu-1', status: 'connected', expires_at: new Date(Date.now() + 60_000),
      }]),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    service.config = { get: jest.fn().mockReturnValue('s'.repeat(48)) };
    service.realtime = { emitSession: jest.fn().mockResolvedValue(null) };

    const result = await service.allocateRelay(8, 'ses_12345678901234567890');

    expect(result.agent_id).toBe('official-eu-1');
    expect(result.endpoint).toBe(stickyAgent.endpoint);
    expect(service.redis.get).toHaveBeenCalledWith('multiplayer:relay:agent:official-eu-1');
    expect(service.redis.get).not.toHaveBeenCalledWith('multiplayer:relay:agent:official-us-1');
    expect(service.relayAllocations.save).toHaveBeenCalledWith(expect.objectContaining({ agent_id: 'official-eu-1' }));

    service.relayAllocations.find.mockResolvedValue([
      { agent_id: 'official-eu-1' }, { agent_id: 'official-us-1' },
    ]);
    await expect(service.allocateRelay(8, 'ses_12345678901234567890')).rejects.toMatchObject({ status: 503 });
  });

  it('renews a connected allocation in place and promotes expiry only for its stable connection id', async () => {
    const secret = 'r'.repeat(48);
    const agent = {
      agent_id: 'official-eu-1', endpoint: 'wss://relay.example.test:443/relay/v1', region: 'eu',
      capacity: 10, active_allocations: 1, capabilities: {}, last_heartbeat_at: Date.now(),
    };
    const allocation = {
      id: 'rly_connected_123456789012', session_id: 'ses_12345678901234567890', peer_id: 'peer_member',
      agent_id: agent.agent_id, status: 'connected', connection_id: 'conn_01JXYZ', connected_at: new Date(),
      pending_expires_at: null, expires_at: new Date(Date.now() + 60_000),
    };
    const originalExpiry = allocation.expires_at;
    const service = Object.create(MultiplayerService.prototype) as any;
    service.requireEnabled = jest.fn().mockResolvedValue(undefined);
    service.findActiveSession = jest.fn().mockResolvedValue({ id: allocation.session_id });
    service.requireActivePeer = jest.fn().mockResolvedValue({ id: allocation.peer_id });
    service.redis = {
      get: jest.fn().mockResolvedValue(JSON.stringify(agent)),
      set: jest.fn().mockResolvedValue('OK'),
      setIfNotExists: jest.fn().mockResolvedValue(true),
      getAndDeleteIfMatches: jest.fn().mockResolvedValue('lock'),
    };
    service.relayAllocations = {
      findOne: jest.fn().mockResolvedValue(allocation),
      findOneBy: jest.fn().mockResolvedValue(allocation),
      update: jest.fn().mockImplementation(async (_where, values) => {
        Object.assign(allocation, values);
        return { affected: 1 };
      }),
    };
    service.peers = { findOneBy: jest.fn().mockResolvedValue({
      id: allocation.peer_id, session_id: allocation.session_id, status: 'active', role: 'member',
    }) };
    service.config = { get: jest.fn((key: string) => key === 'multiplayer.relayCredentialSecret' ? secret : agent.agent_id) };
    service.realtime = { emitSession: jest.fn().mockResolvedValue(null) };

    const refreshed = await service.allocateRelay(8, allocation.session_id);
    const [serialized, signature] = refreshed.credential.split('.');
    const claims = JSON.parse(Buffer.from(serialized, 'base64url').toString('utf8'));
    expect(signature).toBe(createHmac('sha256', secret).update(serialized).digest('base64url'));
    expect(refreshed).toMatchObject({ allocation_id: allocation.id, agent_id: agent.agent_id, expires_in: 120 });
    expect(claims.expiry).toBe(Math.floor(allocation.pending_expires_at.getTime() / 1000));
    expect(allocation.expires_at).toBe(originalExpiry);
    expect(allocation.pending_expires_at.getTime()).toBeGreaterThan(originalExpiry.getTime());
    expect(service.relayAllocations.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: allocation.id, status: 'connected', connection_id: 'conn_01JXYZ', expires_at: expect.anything(),
    }), expect.objectContaining({ pending_expires_at: expect.any(Date) }));

    const renewedExpiry = allocation.pending_expires_at;
    const input = { allocation_id: allocation.id, credential: refreshed.credential, connection_id: 'conn_01JXYZ' };
    const ack = await service.consumeRelayCredential(agent.agent_id, input);
    expect(ack).toMatchObject({
      allocation_id: allocation.id, session_id: allocation.session_id, peer_id: allocation.peer_id,
      peer_role: 'member', connection_id: 'conn_01JXYZ', expires_at: renewedExpiry,
    });
    expect(allocation.expires_at).toBe(renewedExpiry);
    expect(allocation.pending_expires_at).toBeNull();

    const retry = await service.consumeRelayCredential(agent.agent_id, input);
    expect(retry).toEqual(ack);
    expect(service.relayAllocations.update).toHaveBeenCalledTimes(2);
    await expect(service.consumeRelayCredential(agent.agent_id, { ...input, connection_id: 'conn_replay' }))
      .rejects.toMatchObject({ status: 429 });
    expect(service.relayAllocations.update).toHaveBeenCalledTimes(2);
  });

  it('consumes a signed Relay credential once, returns trusted pairing data, and allows only same-connection retries', async () => {
    const secret = 'r'.repeat(48);
    const expiresAt = new Date(Date.now() + 60_000);
    const allocation = {
      id: 'rly_12345678901234567890', session_id: 'ses_12345678901234567890', peer_id: 'peer_owner',
      agent_id: 'official-eu-1', status: 'active', connection_id: null, connected_at: null, expires_at: expiresAt,
    };
    const claims = {
      relay_session_id: allocation.id, session_id: allocation.session_id, peer_id: allocation.peer_id,
      agent_id: allocation.agent_id, expiry: Math.floor(expiresAt.getTime() / 1000),
    };
    const serialized = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', secret).update(serialized).digest('base64url');
    const input = { allocation_id: allocation.id, credential: `${serialized}.${signature}`, connection_id: 'conn_01JXYZ' };
    const service = Object.create(MultiplayerService.prototype) as any;
    service.config = { get: jest.fn((key: string) => key === 'multiplayer.relayCredentialSecret' ? secret : 'official-eu-1') };
    service.relayAllocations = {
      findOneBy: jest.fn().mockImplementation(async () => allocation),
      update: jest.fn().mockImplementation(async (_where, values) => {
        Object.assign(allocation, values);
        return { affected: 1 };
      }),
    };
    service.peers = { findOneBy: jest.fn().mockResolvedValue({ id: 'peer_owner', session_id: allocation.session_id, status: 'active', role: 'owner' }) };

    await expect(service.consumeRelayCredential('official-eu-1', { ...input, credential: `${serialized}.invalid` }))
      .rejects.toMatchObject({ status: 403 });
    expect(service.relayAllocations.findOneBy).not.toHaveBeenCalled();

    const first = await service.consumeRelayCredential('official-eu-1', input);
    const retry = await service.consumeRelayCredential('official-eu-1', input);

    expect(first).toMatchObject({
      allocation_id: allocation.id, agent_id: allocation.agent_id, session_id: allocation.session_id,
      peer_id: allocation.peer_id, peer_role: 'owner', connection_id: 'conn_01JXYZ', expires_at: expiresAt,
    });
    expect(retry).toEqual(first);
    expect(service.relayAllocations.update).toHaveBeenCalledTimes(1);
    expect(allocation.status).toBe('connected');

    await expect(service.consumeRelayCredential('official-eu-1', { ...input, connection_id: 'conn_replay' }))
      .rejects.toMatchObject({ status: 429 });
    expect(service.relayAllocations.update).toHaveBeenCalledTimes(1);
  });

  it('revokes an Agent connection idempotently and refuses a different connection id', async () => {
    const allocation = {
      id: 'rly_12345678901234567890', session_id: 'ses_12345678901234567890', peer_id: 'peer_owner',
      agent_id: 'official-eu-1', status: 'connected', connection_id: 'conn_01JXYZ',
      expires_at: new Date(Date.now() + 60_000),
    };
    const service = Object.create(MultiplayerService.prototype) as any;
    service.config = { get: jest.fn().mockReturnValue('official-eu-1') };
    service.relayAllocations = {
      findOneBy: jest.fn().mockImplementation(async () => allocation),
      update: jest.fn().mockImplementation(async () => { allocation.status = 'revoked'; return { affected: 1 }; }),
      count: jest.fn().mockResolvedValue(0),
    };
    service.redis = {
      setIfNotExists: jest.fn().mockResolvedValue(true), getAndDeleteIfMatches: jest.fn().mockResolvedValue('lock'),
      get: jest.fn().mockResolvedValue(null),
    };
    service.realtime = { emitSession: jest.fn().mockResolvedValue(null) };

    await expect(service.revokeRelayAllocation('official-eu-1', allocation.id, 'wrong-connection'))
      .rejects.toMatchObject({ status: 403 });
    expect(await service.revokeRelayAllocation('official-eu-1', allocation.id, 'conn_01JXYZ'))
      .toEqual({ allocation_id: allocation.id, revoked: true });
    expect(allocation.connection_id).toBe('conn_01JXYZ');
    expect(await service.revokeRelayAllocation('official-eu-1', allocation.id, 'conn_01JXYZ'))
      .toEqual({ allocation_id: allocation.id, revoked: true });
    expect(service.relayAllocations.update).toHaveBeenCalledTimes(1);
    expect(service.realtime.emitSession).toHaveBeenCalledTimes(1);
  });

  it('accepts only allowlisted secure WSS endpoints with an explicit valid port', async () => {
    const service = Object.create(MultiplayerService.prototype) as any;
    service.config = { get: jest.fn().mockReturnValue('official-eu-1') };
    service.relayAllocations = { count: jest.fn().mockResolvedValue(0) };
    service.redis = { setIfNotExists: jest.fn().mockResolvedValue(true), getAndDeleteIfMatches: jest.fn().mockResolvedValue('lock'), set: jest.fn().mockResolvedValue('OK') };

    await expect(service.registerRelayAgent({
      agent_id: 'official-eu-1', endpoint: 'wss://relay.example.test:443/relay/v1', capacity: 10,
    })).resolves.toMatchObject({ registered: true, expires_in: 45 });
    await expect(service.registerRelayAgent({
      agent_id: 'official-eu-1', endpoint: 'ws://relay.example.test:443/relay', capacity: 10,
    })).rejects.toMatchObject({ status: 400 });
    await expect(service.registerRelayAgent({
      agent_id: 'official-eu-1', endpoint: 'wss://relay.example.test:443/relay', capacity: 10,
    })).rejects.toMatchObject({ status: 400 });
    await expect(service.registerRelayAgent({
      agent_id: 'official-eu-1', endpoint: 'wss://relay.example.test:443', capacity: 10,
    })).rejects.toMatchObject({ status: 400 });
    await expect(service.registerRelayAgent({
      agent_id: 'official-eu-1', endpoint: 'wss://relay.example.test/relay', capacity: 10,
    })).rejects.toMatchObject({ status: 400 });
  });

  it('does not allocate Multiplayer V1 credentials to stale legacy Relay endpoints', async () => {
    const staleAgent = {
      agent_id: 'official-eu-1', endpoint: 'wss://relay.example.test:41000/relay', region: 'eu',
      capacity: 10, active_allocations: 0, capabilities: {}, last_heartbeat_at: Date.now(),
    };
    const service = Object.create(MultiplayerService.prototype) as any;
    service.requireEnabled = jest.fn().mockResolvedValue(undefined);
    service.findActiveSession = jest.fn().mockResolvedValue({ id: 'ses_12345678901234567890' });
    service.requireActivePeer = jest.fn().mockResolvedValue({ id: 'peer_1' });
    service.config = { get: jest.fn().mockReturnValue('s'.repeat(48)) };
    service.redis = {
      scanKeys: jest.fn().mockResolvedValue(['multiplayer:relay:agent:official-eu-1']),
      get: jest.fn().mockResolvedValue(JSON.stringify(staleAgent)),
      setIfNotExists: jest.fn().mockResolvedValue(true),
      getAndDeleteIfMatches: jest.fn().mockResolvedValue('lock'),
    };
    service.relayAllocations = {
      findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0), create: jest.fn((value) => value), save: jest.fn(),
    };
    service.realtime = { emitSession: jest.fn() };

    await expect(service.allocateRelay(7, 'ses_12345678901234567890')).rejects.toMatchObject({ status: 503 });
    expect(service.relayAllocations.save).not.toHaveBeenCalled();
  });

  it('creates a Session, owner Peer, and hashed one-time resume credential in one transaction', async () => {
    const saved: any[] = [];
    const sessionRecord = {
      id: 'ses_12345678901234567890', owner_user_id: 7, visibility: 'private', join_policy: 'friends',
      game_id: 'mindustry', game_version: null, activity_name: 'Mindustry', max_players: 8,
      status: 'active', expires_at: new Date(Date.now() + 60_000),
    };
    const manager = {
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (_entity, value) => { saved.push(value); return value; }),
    };
    const service = Object.create(MultiplayerService.prototype) as any;
    service.requireEnabled = jest.fn().mockResolvedValue(undefined);
    service.sessions = { create: jest.fn().mockReturnValue(sessionRecord) };
    service.dataSource = { transaction: jest.fn(async (callback) => callback(manager)) };
    service.peers = { findOneByOrFail: jest.fn().mockResolvedValue({ id: 'peer_owner', user_id: 7, role: 'owner', status: 'active' }) };
    service.redis = { set: jest.fn().mockResolvedValue('OK') };
    service.realtime = { emitSession: jest.fn().mockResolvedValue(null) };

    const result = await service.createSession(7, 'forum_web', { game_id: 'mindustry' });

    expect(result.session).toMatchObject({ id: sessionRecord.id, current_players: 1, visibility: 'private' });
    expect(result.peer).toMatchObject({ peer_id: 'peer_owner', role: 'owner' });
    expect(result.resume_token).toBeTruthy();
    expect(saved).toHaveLength(4);
    expect(saved[1]).toMatchObject({ user_id: 7, client_id: 'forum_web', role: 'owner', status: 'active' });
    expect(saved[2].token_hash).not.toBe(result.resume_token);
    expect(saved[3]).toMatchObject({ action: 'session.created', actor_user_id: 7, target_type: 'session' });
    expect(service.dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('serializes Session joins, rechecks duplicate membership, and enforces capacity in the transaction', async () => {
    const session = {
      id: 'ses_12345678901234567890', owner_user_id: 1, visibility: 'private', join_policy: 'invite_only',
      max_players: 4, status: 'active', expires_at: new Date(Date.now() + 60_000),
    };
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(session).mockResolvedValueOnce(null),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn((_entity, value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const service = Object.create(MultiplayerService.prototype) as any;
    service.requireEnabled = jest.fn().mockResolvedValue(undefined);
    service.findActiveSession = jest.fn().mockResolvedValue(session);
    service.peers = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneByOrFail: jest.fn().mockResolvedValue({ id: 'peer_member', user_id: 7, status: 'active', role: 'member' }),
    };
    service.sessionPolicy = { joinDenialCode: jest.fn().mockResolvedValue(null) };
    service.dataSource = { transaction: jest.fn(async (callback) => callback(manager)) };
    service.redis = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) };
    service.realtime = { emitSession: jest.fn().mockResolvedValue(null), emitUser: jest.fn().mockResolvedValue(null) };

    const result = await service.joinSession(7, 'launcher', session.id, {}, true);

    expect(result.peer).toMatchObject({ peer_id: 'peer_member', status: 'active' });
    expect(service.sessionPolicy.joinDenialCode).toHaveBeenCalledWith(7, session, { viaInviteOrApproval: true, viaJoinCode: false });
    expect(manager.findOne).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(manager.count).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ where: expect.objectContaining({ session_id: session.id }) }));
  });

  it('rotates Peer resume tokens once and binds resume to the original client', async () => {
    const session = { id: 'ses_12345678901234567890', expires_at: new Date(Date.now() + 60_000), status: 'closing' };
    const peer = {
      id: 'peer_owner', session_id: session.id, user_id: 7, client_id: 'launcher', role: 'owner', status: 'disconnected',
      last_seen_at: new Date(Date.now() - 1_000),
    };
    const token = { id: 10, peer_id: peer.id, expires_at: new Date(Date.now() + 60_000), consumed_at: null };
    const service = Object.create(MultiplayerService.prototype) as any;
    const sessionQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    service.resumeTokens = {
      findOne: jest.fn().mockResolvedValue(token),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    service.peers = {
      findOneBy: jest.fn().mockResolvedValue(peer),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(async (value) => value),
    };
    service.sessions = {
      findOneBy: jest.fn().mockResolvedValue(session),
      createQueryBuilder: jest.fn(() => sessionQueryBuilder),
      save: jest.fn(async (value) => value),
    };
    service.redis = {
      setIfNotExists: jest.fn().mockResolvedValue(true),
      getAndDeleteIfMatches: jest.fn().mockResolvedValue('lock'),
      del: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
    };
    service.realtime = { emitSession: jest.fn().mockResolvedValue(null) };

    await expect(service.resumePeer(7, 'other-launcher', session, 'raw-token')).rejects.toMatchObject({ status: 403 });
    expect(service.resumeTokens.update).not.toHaveBeenCalled();

    const result = await service.resumePeer(7, 'launcher', session, 'raw-token');
    expect(result).toMatchObject({ resumed: true, peer: { peer_id: 'peer_owner', status: 'active' } });
    expect(service.resumeTokens.update).toHaveBeenCalledWith({ id: 10, consumed_at: expect.anything() }, { consumed_at: expect.any(Date) });
    expect(service.resumeTokens.save).toHaveBeenCalledWith(expect.objectContaining({ peer_id: 'peer_owner', consumed_at: null }));
    expect(sessionQueryBuilder.set).toHaveBeenCalledWith({ status: 'active', close_after: null });
    expect(sessionQueryBuilder.execute).toHaveBeenCalled();
  });
});

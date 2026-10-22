import 'reflect-metadata';
import { createHmac } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { entities } from '../../entities';
import { MultiplayerRelayAllocation } from '../../entities/multiplayer-relay-allocation.entity';
import { MultiplayerService } from './multiplayer.service';

const enabled = process.env.RUN_MULTIPLAYER_RELAY_MYSQL === '1';
const mysqlDescribe = enabled ? describe : describe.skip;
const sessionId = 'ses_mysql_relay_123456789012';
const firstPeerId = 'peer_mysql_member';
const stickyPeerId = 'peer_mysql_sticky';
const agentId = 'official-cn-1';
const otherAgentId = 'official-us-1';
const credentialSecret = 'mysql-relay-regression-secret-at-least-32-bytes';

function decodeClaims(credential: string) {
  return JSON.parse(Buffer.from(credential.split('.')[0], 'base64url').toString('utf8')) as {
    relay_session_id: string;
    session_id: string;
    peer_id: string;
    agent_id: string;
    expiry: number;
  };
}

function signCredential(allocation: MultiplayerRelayAllocation, expiresAt: Date): string {
  const claims = {
    relay_session_id: allocation.id,
    session_id: allocation.session_id,
    peer_id: allocation.peer_id,
    agent_id: allocation.agent_id,
    expiry: Math.floor(expiresAt.getTime() / 1000),
  };
  const serialized = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', credentialSecret).update(serialized).digest('base64url');
  return `${serialized}.${signature}`;
}

mysqlDescribe('Multiplayer Relay MySQL 8 precision regression', () => {
  let dataSource: DataSource;
  let repository: Repository<MultiplayerRelayAllocation>;
  let tableName: string;
  let tableCreated = false;

  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test'
      || process.env.MYSQL_HOST !== '127.0.0.1'
      || process.env.MYSQL_DATABASE !== 'mindfourm_ci') {
      throw new Error('Relay MySQL integration is restricted to the isolated 127.0.0.1/mindfourm_ci test database.');
    }

    dataSource = new DataSource({
      type: 'mysql',
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      username: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE,
      entities,
      // Give this test its own table so it can run beside the full E2E schema.
      entityPrefix: `relay_it_${process.pid}_`,
      synchronize: false,
      migrationsRun: false,
    });
    await dataSource.initialize();
    const [{ version }] = await dataSource.query('SELECT VERSION() AS version');
    if (!/^8\./.test(String(version)) || /mariadb/i.test(String(version))) {
      throw new Error(`Relay MySQL integration requires MySQL 8; received ${version}.`);
    }

    repository = dataSource.getRepository(MultiplayerRelayAllocation);
    tableName = repository.metadata.tableName;
    if (!new RegExp(`^relay_it_${process.pid}_multiplayer_relay_allocations$`).test(tableName)) {
      throw new Error(`Refusing unexpected Relay integration table name: ${tableName}`);
    }
    await dataSource.query(`
      CREATE TABLE \`${tableName}\` (
        id VARCHAR(48) NOT NULL,
        session_id VARCHAR(48) NOT NULL,
        peer_id VARCHAR(48) NOT NULL,
        agent_id VARCHAR(96) NOT NULL,
        status ENUM('active','connected','revoked','expired') NOT NULL DEFAULT 'active',
        connection_id VARCHAR(128) NULL,
        connected_at DATETIME NULL,
        pending_expires_at DATETIME NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_multiplayer_relay_agent_connection (agent_id, connection_id),
        KEY idx_multiplayer_relay_session_status (session_id, status),
        KEY idx_multiplayer_relay_agent_status (agent_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    tableCreated = true;
  }, 30_000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (tableCreated) await dataSource.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      await dataSource.destroy();
    }
  });

  it('reproduces rounded DATETIME failures and completes fresh auth, concurrent renewal, ACK retry, replay, and sticky Agent checks', async () => {
    const realNow = Date.now();
    const fixedNow = Math.floor(realNow / 1000) * 1000 + 583;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const agents = new Map([
      [agentId, {
        agent_id: agentId, endpoint: 'wss://relay-cn.example.test:443/relay/v1', region: 'cn',
        capacity: 10, active_allocations: 0, capabilities: {}, last_heartbeat_at: realNow,
      }],
      [otherAgentId, {
        agent_id: otherAgentId, endpoint: 'wss://relay-us.example.test:443/relay/v1', region: 'us',
        capacity: 10, active_allocations: 0, capabilities: {}, last_heartbeat_at: realNow,
      }],
    ]);
    const service = Object.create(MultiplayerService.prototype) as any;
    service.requireEnabled = jest.fn().mockResolvedValue(undefined);
    service.findActiveSession = jest.fn().mockResolvedValue({ id: sessionId });
    service.requireActivePeer = jest.fn(async (userId: number) => ({
      id: userId === 10 ? stickyPeerId : firstPeerId,
    }));
    service.config = { get: jest.fn((key: string) => {
      if (key === 'multiplayer.relayCredentialSecret') return credentialSecret;
      if (key === 'multiplayer.relayAgentIds') return `${agentId},${otherAgentId}`;
      return undefined;
    }) };
    service.relayAllocations = repository;
    service.peers = { findOneBy: jest.fn(async (where: { id: string }) => ({
      id: where.id, session_id: sessionId, status: 'active', role: where.id === stickyPeerId ? 'member' : 'owner',
    })) };
    service.redis = {
      scanKeys: jest.fn(async () => [...agents.keys()].map((id) => `multiplayer:relay:agent:${id}`)),
      get: jest.fn(async (key: string) => {
        const id = key.slice('multiplayer:relay:agent:'.length);
        const value = agents.get(id);
        return value ? JSON.stringify(value) : null;
      }),
      set: jest.fn(async (key: string, value: string) => {
        const id = key.slice('multiplayer:relay:agent:'.length);
        if (agents.has(id)) agents.set(id, JSON.parse(value));
        return 'OK';
      }),
      // Simulate an expired 30-second lease so DB CAS still protects overlapping
      // work if an operation outlives its Redis lock.
      setIfNotExists: jest.fn().mockResolvedValue(true),
      getAndDeleteIfMatches: jest.fn().mockResolvedValue('lock'),
    };
    service.realtime = { emitSession: jest.fn().mockResolvedValue(null) };

    try {
      const legacyExpiry = new Date(fixedNow + 120_000);
      expect(legacyExpiry.getUTCMilliseconds()).toBe(583);
      const legacyRow = repository.create({
        id: 'rly_legacy_mysql_123456789012', session_id: sessionId, peer_id: 'peer_mysql_legacy',
        agent_id: agentId, status: 'active', connection_id: null, connected_at: null,
        pending_expires_at: null, expires_at: legacyExpiry,
      });
      await repository.save(legacyRow);
      const legacyStored = await repository.findOneByOrFail({ id: legacyRow.id });
      expect(legacyStored.expires_at.getTime()).toBe(legacyExpiry.getTime() + 417);
      expect(Math.floor(legacyStored.expires_at.getTime() / 1000)).toBe(Math.floor(legacyExpiry.getTime() / 1000) + 1);
      const legacyCredential = signCredential(legacyRow, legacyExpiry);
      await expect(service.consumeRelayCredential(agentId, {
        allocation_id: legacyRow.id, credential: legacyCredential, connection_id: 'conn_legacy_mysql',
      })).rejects.toMatchObject({ status: 403 });
      await expect(service.revokeRelayAllocation(agentId, legacyRow.id, 'conn_bad', `${legacyCredential}x`))
        .rejects.toMatchObject({ status: 403 });
      expect((await repository.findOneByOrFail({ id: legacyRow.id })).status).toBe('active');
      await expect(service.revokeRelayAllocation(agentId, legacyRow.id, 'conn_legacy_mysql', legacyCredential))
        .resolves.toMatchObject({ allocation_id: legacyRow.id, revoked: true });
      expect((await repository.findOneByOrFail({ id: legacyRow.id })).status).toBe('revoked');
      await repository.delete({ id: legacyRow.id });

      const fresh = await service.allocateRelay(9, sessionId);
      const freshAllocation = await repository.findOneByOrFail({ id: fresh.allocation_id });
      const freshClaims = decodeClaims(fresh.credential);
      expect(fresh.agent_id).toBe(freshAllocation.agent_id);
      expect(freshAllocation.expires_at.getUTCMilliseconds()).toBe(0);
      expect(freshClaims.expiry).toBe(Math.floor(freshAllocation.expires_at.getTime() / 1000));
      expect(await repository.count({ where: { peer_id: firstPeerId } })).toBe(1);
      await expect(service.allocateRelay(9, sessionId)).rejects.toMatchObject({ status: 429 });

      const connectionId = 'conn_mysql_stable_123';
      const initialAck = await service.consumeRelayCredential(agentId, {
        allocation_id: fresh.allocation_id, credential: fresh.credential, connection_id: connectionId,
      });
      expect(initialAck).toMatchObject({ allocation_id: fresh.allocation_id, agent_id: agentId, connection_id: connectionId });

      const renewals = await Promise.all([
        service.allocateRelay(9, sessionId),
        service.allocateRelay(9, sessionId),
      ]);
      const staged = await repository.findOneByOrFail({ id: fresh.allocation_id });
      expect(staged.status).toBe('connected');
      expect(staged.connection_id).toBe(connectionId);
      expect(staged.pending_expires_at).not.toBeNull();
      expect(renewals.map(({ allocation_id }: { allocation_id: string }) => allocation_id))
        .toEqual([fresh.allocation_id, fresh.allocation_id]);
      expect(renewals.map(({ agent_id }: { agent_id: string }) => agent_id)).toEqual([agentId, agentId]);
      expect(renewals[0].credential).toBe(renewals[1].credential);
      expect(decodeClaims(renewals[0].credential).expiry)
        .toBe(Math.floor(staged.pending_expires_at!.getTime() / 1000));
      expect(await repository.count({ where: { peer_id: firstPeerId } })).toBe(1);

      const renewalInput = {
        allocation_id: fresh.allocation_id, credential: renewals[0].credential, connection_id: connectionId,
      };
      const promoted = await service.consumeRelayCredential(agentId, renewalInput);
      expect(promoted.expires_at.getTime()).toBe(staged.pending_expires_at!.getTime());
      const ackRetry = await service.consumeRelayCredential(agentId, renewalInput);
      expect(ackRetry).toEqual(promoted);
      const afterAck = await repository.findOneByOrFail({ id: fresh.allocation_id });
      expect(afterAck.expires_at.getTime()).toBe(staged.pending_expires_at!.getTime());
      expect(afterAck.pending_expires_at).toBeNull();
      await expect(service.consumeRelayCredential(agentId, { ...renewalInput, connection_id: 'conn_mysql_replay' }))
        .rejects.toMatchObject({ status: 429 });

      const sticky = await service.allocateRelay(10, sessionId);
      expect(sticky.agent_id).toBe(agentId);
      expect(await repository.count({ where: { session_id: sessionId, agent_id: agentId } })).toBe(2);
      expect(await repository.count({ where: { session_id: sessionId, agent_id: otherAgentId } })).toBe(0);
    } finally {
      nowSpy.mockRestore();
      await repository.delete({ id: 'rly_legacy_mysql_123456789012' });
      await repository.delete({ peer_id: firstPeerId });
      await repository.delete({ peer_id: stickyPeerId });
    }
  }, 30_000);
});

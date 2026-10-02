import {
  BadRequestException, ConflictException, ForbiddenException, GoneException, HttpException, Injectable, Logger, NotFoundException,
  OnModuleDestroy, OnModuleInit, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'crypto';
import { isIP } from 'net';
import { DataSource, EntityManager, In, IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import axios from 'axios';
import { RedisService } from '../../database/redis.service';
import { Friendship } from '../../entities/friendship.entity';
import { MultiplayerAuditLog } from '../../entities/multiplayer-audit-log.entity';
import { MultiplayerInvite } from '../../entities/multiplayer-invite.entity';
import { MultiplayerJoinIntent } from '../../entities/multiplayer-join-intent.entity';
import { MultiplayerJoinRequest } from '../../entities/multiplayer-join-request.entity';
import { MultiplayerPeer } from '../../entities/multiplayer-peer.entity';
import { MultiplayerPeerResumeToken } from '../../entities/multiplayer-peer-resume-token.entity';
import { MultiplayerRelayAllocation } from '../../entities/multiplayer-relay-allocation.entity';
import { MultiplayerSession } from '../../entities/multiplayer-session.entity';
import { User } from '../../entities/user.entity';
import { UserPresencePreference } from '../../entities/user-presence-preference.entity';
import { FriendsService } from '../friends/friends.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { SettingsService } from '../settings/settings.service';
import { SocialPolicyService } from '../social/social-policy.service';
import {
  CandidatePayloadDto, CreateMultiplayerInviteDto, CreateMultiplayerSessionDto,
  RelayAgentRegisterDto, RelayAllocationAckDto,
} from './dto/multiplayer.dto';
import { InvitePolicyService } from './invite-policy.service';
import { SessionPolicyService } from './session-policy.service';
import { MULTIPLAYER_CAPACITY_PEER_STATUSES } from './multiplayer.constants';

const PRESENCE_TTL_SECONDS = 90;
const PEER_DISCONNECT_GRACE_SECONDS = 60;
const SESSION_LIFETIME_MS = 4 * 60 * 60 * 1000;
const INVITE_TTL_MS = 5 * 60 * 1000;
const JOIN_REQUEST_TTL_MS = 5 * 60 * 1000;
const JOIN_INTENT_TTL_SECONDS = 60;
const APPROVED_JOIN_INTENT_TTL_MS = 10 * 60 * 1000;
const APPROVED_JOIN_RESULT_RECOVERY_MS = 10 * 60 * 1000;
const APPROVED_JOIN_EVENT_RETRY_MS = 5 * 1000;
const OWNER_GRACE_MS = 60 * 1000;
const RELAY_CREDENTIAL_TTL_SECONDS = 120;
const MAX_CANDIDATES_PER_PEER = 32;
const MAX_CANDIDATE_METADATA_BYTES = 1024;

type SessionVisibility = MultiplayerSession['visibility'];
type SessionJoinPolicy = MultiplayerSession['join_policy'];

interface RelayAgentRecord {
  agent_id: string;
  endpoint: string;
  region: string | null;
  capacity: number;
  active_allocations: number;
  capabilities: Record<string, unknown>;
  last_heartbeat_at: number;
}

interface CandidateRecord extends CandidatePayloadDto {
  candidate_id: string;
  peer_id: string;
  created_at: number;
}

interface RelayCredentialClaims {
  relay_session_id: string;
  session_id: string;
  peer_id: string;
  agent_id: string;
  expiry: number;
}

interface PublicClientMetadata {
  client_id: string;
  name: string;
  application_icon_url: string | null;
  developer_name: string | null;
  developer_url: string | null;
  supports_presence: boolean;
  supports_multiplayer: boolean;
  supports_join_intent: boolean;
  launch_uri_template: string | null;
}

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('base64url')}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function signRelayCredential(
  secret: string,
  allocation: { id: string; session_id: string; peer_id: string; agent_id: string },
  expiresAt: Date,
): string {
  const payload = {
    relay_session_id: allocation.id,
    session_id: allocation.session_id,
    peer_id: allocation.peer_id,
    agent_id: allocation.agent_id,
    expiry: Math.floor(expiresAt.getTime() / 1000),
  };
  const serialized = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(serialized).digest('base64url');
  return `${serialized}.${signature}`;
}

function verifyRelayCredential(credential: string, secret: string): RelayCredentialClaims | null {
  const parts = credential.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]
    || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
  const suppliedSignature = Buffer.from(parts[1], 'base64url');
  if (suppliedSignature.toString('base64url') !== parts[1]) return null;
  const expectedSignature = createHmac('sha256', secret).update(parts[0]).digest();
  if (suppliedSignature.length !== expectedSignature.length
    || !timingSafeEqual(suppliedSignature, expectedSignature)) return null;

  try {
    const payloadBytes = Buffer.from(parts[0], 'base64url');
    if (payloadBytes.toString('base64url') !== parts[0]) return null;
    const payload = JSON.parse(payloadBytes.toString('utf8')) as Record<string, unknown>;
    const expectedKeys = ['agent_id', 'expiry', 'peer_id', 'relay_session_id', 'session_id'];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || Object.keys(payload).length !== expectedKeys.length
      || expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(payload, key))
      || typeof payload.relay_session_id !== 'string'
      || typeof payload.session_id !== 'string'
      || typeof payload.peer_id !== 'string'
      || typeof payload.agent_id !== 'string'
      || !Number.isSafeInteger(payload.expiry)) return null;
    return payload as unknown as RelayCredentialClaims;
  } catch {
    return null;
  }
}

function explicitRelayPort(endpoint: string): number | null {
  const match = endpoint.match(/^[a-z][a-z\d+.-]*:\/\/(?:\[[^\]]+\]|[^/:?#@]+):(\d+)(?:[/?#]|$)/i);
  if (!match) return null;
  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function isMultiplayerV1Endpoint(value: string): boolean {
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === 'wss:' && !!endpoint.hostname && explicitRelayPort(value) !== null
      && endpoint.pathname === '/relay/v1' && !endpoint.username && !endpoint.password
      && !endpoint.search && !endpoint.hash;
  } catch {
    return false;
  }
}

function fail(status: number, code: string): never {
  const payload = { code, message: code };
  if (status === 400) throw new BadRequestException(payload);
  if (status === 403) throw new ForbiddenException(payload);
  if (status === 404) throw new NotFoundException(payload);
  if (status === 409) throw new ConflictException(payload);
  if (status === 410) throw new GoneException(payload);
  if (status === 429) throw new HttpException(payload, 429);
  throw new ServiceUnavailableException(payload);
}

@Injectable()
export class MultiplayerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MultiplayerService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;
  private publicClientCache: { expires_at: number; clients: PublicClientMetadata[] } | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(MultiplayerSession) private readonly sessions: Repository<MultiplayerSession>,
    @InjectRepository(MultiplayerPeer) private readonly peers: Repository<MultiplayerPeer>,
    @InjectRepository(MultiplayerPeerResumeToken) private readonly resumeTokens: Repository<MultiplayerPeerResumeToken>,
    @InjectRepository(MultiplayerInvite) private readonly invites: Repository<MultiplayerInvite>,
    @InjectRepository(MultiplayerJoinIntent) private readonly joinIntents: Repository<MultiplayerJoinIntent>,
    @InjectRepository(MultiplayerJoinRequest) private readonly joinRequests: Repository<MultiplayerJoinRequest>,
    @InjectRepository(MultiplayerRelayAllocation) private readonly relayAllocations: Repository<MultiplayerRelayAllocation>,
    @InjectRepository(MultiplayerAuditLog) private readonly audit: Repository<MultiplayerAuditLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserPresencePreference) private readonly presencePreferences: Repository<UserPresencePreference>,
    @InjectRepository(Friendship) private readonly friendships: Repository<Friendship>,
    private readonly redis: RedisService,
    private readonly friends: FriendsService,
    private readonly socialPolicy: SocialPolicyService,
    private readonly sessionPolicy: SessionPolicyService,
    private readonly invitePolicy: InvitePolicyService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeEventsService,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.cleanupTimer = setInterval(() => void this.cleanupExpiredSessions(), 5000);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async capabilities() {
    const [sessions, invites, relay, thirdParty] = await Promise.all([
      this.enabled('multiplayer_sessions_v1'), this.enabled('multiplayer_invites_v1'),
      this.enabled('multiplayer_relay_v1'), this.enabled('third_party_multiplayer_v1'),
    ]);
    return {
      sessions_v1: sessions,
      invites_v1: sessions && invites,
      relay_v1: sessions && relay,
      third_party_multiplayer: sessions && thirdParty,
      visibility: ['private', 'friends', 'unlisted'] as const,
      join_policies: ['open', 'friends', 'request', 'invite_only'] as const,
      transports: ['udp', 'tcp', 'quic', 'custom'] as const,
      relay_credential_ttl_seconds: RELAY_CREDENTIAL_TTL_SECONDS,
    };
  }

  async getMultiplayerPreferences(userId: number) {
    const [preference, clients] = await Promise.all([
      this.presencePreferences.findOneBy({ user_id: userId }),
      this.listJoinIntentClients(),
    ]);
    return { default_client_id: preference?.default_multiplayer_client_id || null, clients };
  }

  async setDefaultMultiplayerClient(userId: number, clientId?: string) {
    const normalized = clientId?.trim() || null;
    if (normalized && !(await this.listJoinIntentClients()).some((client) => client.client_id === normalized)) {
      fail(400, 'SESSION_PERMISSION_DENIED');
    }
    await this.presencePreferences.createQueryBuilder().insert().orIgnore().values({ user_id: userId }).execute();
    await this.presencePreferences.update({ user_id: userId }, { default_multiplayer_client_id: normalized });
    return this.getMultiplayerPreferences(userId);
  }

  async clientMetadataFor(clientIds: string[]): Promise<Map<string, PublicClientMetadata>> {
    const ids = [...new Set(clientIds.filter((id) => typeof id === 'string' && id.length > 0))];
    if (!ids.length) return new Map();
    const clients = await this.publicClients();
    const byId = new Map(clients.map((client) => [client.client_id, client]));
    return new Map(ids.flatMap((id) => byId.has(id) ? [[id, byId.get(id)!] as const] : []));
  }

  async listJoinIntentClients(): Promise<PublicClientMetadata[]> {
    return (await this.publicClients()).filter((client) => client.supports_join_intent && !!client.launch_uri_template);
  }

  async assertThirdPartyClientCapability(clientId: string, capability: 'supports_presence' | 'supports_multiplayer'): Promise<void> {
    const client = (await this.publicClients()).find((item) => item.client_id === clientId);
    if (!client || !client[capability]) fail(403, 'CLIENT_CAPABILITY_NOT_APPROVED');
  }

  private async publicClients(): Promise<PublicClientMetadata[]> {
    if (this.publicClientCache && this.publicClientCache.expires_at > Date.now()) return this.publicClientCache.clients;
    const baseUrl = this.config.get<string>('mindauth.baseUrl');
    if (!baseUrl) return [];
    try {
      const endpoint = new URL('/api/public/apps', baseUrl).toString();
      const response = await axios.get<{ applications?: Array<Partial<PublicClientMetadata>> }>(endpoint, { timeout: 3000 });
      const clients = (response.data?.applications || []).flatMap((app) => {
        if (typeof app.client_id !== 'string' || typeof app.name !== 'string') return [];
        const launchTemplate = typeof app.launch_uri_template === 'string' && app.launch_uri_template.includes('{intent_id}')
          ? app.launch_uri_template : null;
        return [{
          client_id: app.client_id,
          name: app.name,
          application_icon_url: typeof app.application_icon_url === 'string' ? app.application_icon_url : null,
          developer_name: typeof app.developer_name === 'string' ? app.developer_name : null,
          developer_url: typeof app.developer_url === 'string' ? app.developer_url : null,
          supports_presence: app.supports_presence === true,
          supports_multiplayer: app.supports_multiplayer === true,
          supports_join_intent: app.supports_join_intent === true && !!launchTemplate,
          launch_uri_template: launchTemplate,
        }];
      });
      this.publicClientCache = { clients, expires_at: Date.now() + 60_000 };
      return clients;
    } catch (error) {
      this.logger.warn(`MindAuth public app metadata unavailable: ${(error as Error).message}`);
      return this.publicClientCache?.clients || [];
    }
  }

  async createSession(userId: number, clientId: string, input: CreateMultiplayerSessionDto) {
    await this.requireEnabled('multiplayer_sessions_v1');
    const gameId = input.game_id.trim();
    if (!gameId || gameId.length > 128) fail(400, 'SESSION_NOT_JOINABLE');
    const visibility: SessionVisibility = input.visibility || 'private';
    const joinPolicy: SessionJoinPolicy = input.join_policy || 'friends';
    if (visibility === 'private' && joinPolicy === 'open') fail(400, 'SESSION_NOT_JOINABLE');

    const id = opaqueId('ses');
    const code = visibility === 'unlisted' ? randomBytes(5).toString('hex').toUpperCase() : null;
    const session = this.sessions.create({
      id,
      owner_user_id: userId,
      code_hash: code ? sha256(code) : null,
      visibility,
      join_policy: joinPolicy,
      game_id: gameId,
      game_version: input.game_version?.trim() || null,
      activity_name: input.activity_name?.trim() || gameId,
      max_players: input.max_players ?? 8,
      status: 'active',
      close_after: null,
      expires_at: new Date(Date.now() + SESSION_LIFETIME_MS),
    });
    const peerId = opaqueId('peer');
    const resumeToken = randomBytes(32).toString('base64url');
    await this.dataSource.transaction(async (manager) => {
      await manager.save(MultiplayerSession, session);
      await manager.save(MultiplayerPeer, manager.create(MultiplayerPeer, {
        id: peerId, session_id: id, user_id: userId, client_id: clientId,
        role: 'owner', status: 'active', capabilities: null, last_seen_at: new Date(),
      }));
      await manager.save(MultiplayerPeerResumeToken, manager.create(MultiplayerPeerResumeToken, {
        peer_id: peerId, token_hash: sha256(resumeToken), expires_at: new Date(session.expires_at), consumed_at: null,
      }));
      await manager.save(MultiplayerAuditLog, manager.create(MultiplayerAuditLog, {
        actor_user_id: userId, action: 'session.created', target_type: 'session', target_id: id,
        details: { visibility, join_policy: joinPolicy, game_id: gameId },
      }));
    });
    await this.redis.set(`multiplayer:peer:${peerId}`, JSON.stringify({ peer_id: peerId, session_id: id, user_id: userId, client_id: clientId }), PRESENCE_TTL_SECONDS);
    await this.redis.set(`multiplayer:session:${id}`, JSON.stringify({ session_id: id, status: 'active', owner_user_id: userId }), Math.ceil(SESSION_LIFETIME_MS / 1000));
    await this.realtime.emitSession(id, 'session.updated', { session_id: id, status: 'active' });
    return {
      session: this.toPublicSession(session, 1),
      peer: this.toPublicPeer(await this.peers.findOneByOrFail({ id: peerId })),
      resume_token: resumeToken,
      ...(code ? { join_code: code } : {}),
    };
  }

  async getSession(viewerId: number, sessionId: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    const session = await this.findActiveSession(sessionId);
    const peer = await this.activePeer(sessionId, viewerId);
    if (!peer && !(await this.canViewSession(viewerId, session))) fail(403, 'SESSION_PERMISSION_DENIED');
    return this.toPublicSession(session, await this.peers.count({ where: { session_id: sessionId, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } }));
  }

  async resolveCode(viewerId: number, code: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    const normalized = code.trim().toUpperCase();
    if (!/^[A-F0-9]{10}$/.test(normalized)) fail(404, 'SESSION_NOT_FOUND');
    const session = await this.sessions.findOneBy({ code_hash: sha256(normalized) });
    if (!session) fail(404, 'SESSION_NOT_FOUND');
    await this.assertSessionActive(session);
    if (await this.socialPolicy.isBlockedEither(viewerId, session.owner_user_id)) fail(403, 'SESSION_PERMISSION_DENIED');
    return this.toPublicSession(session, await this.peers.count({ where: { session_id: session.id, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } }));
  }

  async joinSession(userId: number, clientId: string, sessionId: string, input: { invite_id?: string; resume_token?: string; join_code?: string; capabilities?: Record<string, unknown> } = {}, approvedIntent = false) {
    await this.requireEnabled('multiplayer_sessions_v1');
    if (input.resume_token) return this.resumePeer(userId, clientId, await this.findResumableSession(sessionId), input.resume_token);
    const session = await this.findActiveSession(sessionId);
    const existing = await this.peers.findOne({ where: { session_id: sessionId, user_id: userId, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } });
    if (existing) fail(400, 'SESSION_NOT_JOINABLE');
    const invite = input.invite_id ? await this.getUsableInvite(input.invite_id, sessionId, userId) : null;
    const codeAuthorized = !!input.join_code && !!session.code_hash && timingSafeEqual(
      Buffer.from(sha256(input.join_code.trim().toUpperCase()), 'hex'), Buffer.from(session.code_hash, 'hex'),
    );
    if (input.join_code && !codeAuthorized) fail(403, 'SESSION_PERMISSION_DENIED');
    await this.assertCanJoin(userId, session, !!invite || approvedIntent, codeAuthorized);

    const peerId = opaqueId('peer');
    const resumeToken = randomBytes(32).toString('base64url');
    await this.dataSource.transaction(async (manager) => {
      const lockedSession = await manager.findOne(MultiplayerSession, { where: { id: sessionId }, lock: { mode: 'pessimistic_write' } });
      if (!lockedSession || lockedSession.status !== 'active' || lockedSession.expires_at.getTime() <= Date.now()) fail(404, 'SESSION_CLOSED');
      const occupyingMembership = await manager.findOne(MultiplayerPeer, {
        where: { session_id: sessionId, user_id: userId, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) },
        lock: { mode: 'pessimistic_write' },
      });
      if (occupyingMembership) fail(400, 'SESSION_NOT_JOINABLE');
      const count = await manager.count(MultiplayerPeer, { where: { session_id: sessionId, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } });
      if (count >= lockedSession.max_players) fail(409, 'SESSION_FULL');
      await manager.save(MultiplayerPeer, manager.create(MultiplayerPeer, {
        id: peerId, session_id: sessionId, user_id: userId, client_id: clientId,
        role: 'member', status: 'active', capabilities: input.capabilities || null, last_seen_at: new Date(),
      }));
      await manager.save(MultiplayerPeerResumeToken, manager.create(MultiplayerPeerResumeToken, {
        peer_id: peerId, token_hash: sha256(resumeToken), expires_at: lockedSession.expires_at, consumed_at: null,
      }));
      await manager.save(MultiplayerAuditLog, manager.create(MultiplayerAuditLog, {
        actor_user_id: userId, action: 'peer.joined', target_type: 'session', target_id: sessionId, details: { peer_id: peerId },
      }));
    });
    if (invite) await this.invites.update(invite.id, { status: 'accepted' });
    await this.redis.set(`multiplayer:peer:${peerId}`, JSON.stringify({ peer_id: peerId, session_id: sessionId, user_id: userId, client_id: clientId }), PRESENCE_TTL_SECONDS);
    await this.clearCandidates(sessionId, peerId);
    await this.realtime.emitSession(sessionId, 'peer.joined', { session_id: sessionId, peer_id: peerId, user_id: userId });
    await this.realtime.emitUser(session.owner_user_id, 'session.updated', { session_id: sessionId, status: 'active' });
    return { peer: this.toPublicPeer(await this.peers.findOneByOrFail({ id: peerId })), resume_token: resumeToken };
  }

  async resumePeer(userId: number, clientId: string, session: MultiplayerSession, rawToken: string) {
    const token = await this.resumeTokens.findOne({ where: { token_hash: sha256(rawToken), consumed_at: IsNull() } });
    if (!token || token.expires_at.getTime() <= Date.now()) fail(403, 'PEER_RESUME_INVALID');
    const result = await this.withRelayLock(`multiplayer:relay:peer-lock:${token.peer_id}`, async () => {
      const now = new Date();
      const resumeCutoff = new Date(now.getTime() - (PRESENCE_TTL_SECONDS + PEER_DISCONNECT_GRACE_SECONDS) * 1000);
      const currentToken = await this.resumeTokens.findOne({ where: {
        id: token.id, token_hash: sha256(rawToken), consumed_at: IsNull(),
      } });
      if (!currentToken || currentToken.expires_at.getTime() <= now.getTime()) fail(403, 'PEER_RESUME_INVALID');
      const currentSession = await this.sessions.findOneBy({ id: session.id });
      if (!currentSession || currentSession.expires_at.getTime() <= now.getTime()
        || !['active', 'closing'].includes(currentSession.status)
        || (currentSession.status === 'closing' && currentSession.close_after && currentSession.close_after.getTime() <= now.getTime())) {
        fail(403, 'PEER_RESUME_INVALID');
      }
      const peer = await this.peers.findOneBy({ id: currentToken.peer_id });
      if (!peer || peer.user_id !== userId || peer.client_id !== clientId || peer.session_id !== session.id
        || !['disconnected', 'active'].includes(peer.status) || !peer.last_seen_at
        || peer.last_seen_at.getTime() <= resumeCutoff.getTime()) fail(403, 'PEER_RESUME_INVALID');
      const update = await this.resumeTokens.update({ id: currentToken.id, consumed_at: IsNull() }, { consumed_at: now });
      if (!update.affected) fail(403, 'PEER_RESUME_INVALID');
      const peerUpdate = await this.peers.update({
        id: peer.id, session_id: session.id, user_id: userId, client_id: clientId,
        status: In(['disconnected', 'active']), last_seen_at: MoreThan(resumeCutoff),
      }, { status: 'active', last_seen_at: now });
      if (!peerUpdate.affected) fail(403, 'PEER_RESUME_INVALID');
      peer.status = 'active';
      peer.last_seen_at = now;
      const rotatedToken = randomBytes(32).toString('base64url');
      if (peer.role === 'owner') {
        const sessionUpdate = await this.sessions.createQueryBuilder().update(MultiplayerSession)
          .set({ status: 'active', close_after: null })
          .where('id = :sessionId AND status IN (:...resumableStatuses)', {
            sessionId: session.id, resumableStatuses: ['active', 'closing'],
          })
          .andWhere("(status = 'active' OR close_after IS NULL OR close_after > :now)", { now })
          .execute();
        if (!sessionUpdate.affected) {
          await this.peers.update({ id: peer.id, session_id: session.id, status: 'active' }, { status: 'expired' });
          fail(403, 'PEER_RESUME_INVALID');
        }
      }
      await this.resumeTokens.save(this.resumeTokens.create({
        peer_id: peer.id, token_hash: sha256(rotatedToken), expires_at: session.expires_at, consumed_at: null,
      }));
      await this.redis.del(`multiplayer:peer-cleanup:${peer.id}`);
      await this.redis.set(`multiplayer:peer:${peer.id}`, JSON.stringify({ peer_id: peer.id, session_id: session.id, user_id: userId, client_id: peer.client_id }), PRESENCE_TTL_SECONDS);
      await this.realtime.emitSession(session.id, 'peer.updated', { session_id: session.id, peer_id: peer.id, status: 'active' });
      return { peer: this.toPublicPeer(peer), resumed: true, resume_token: rotatedToken };
    });
    if (!result) fail(403, 'PEER_RESUME_INVALID');
    return result;
  }

  async heartbeat(userId: number, sessionId: string, peerId: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    await this.findActiveSession(sessionId);
    const peer = await this.requirePeer(userId, sessionId, peerId);
    if (peer.status !== 'active') fail(404, 'PEER_EXPIRED');
    const now = new Date();
    const activeLeaseCutoff = new Date(now.getTime() - PRESENCE_TTL_SECONDS * 1000);
    if (!peer.last_seen_at || peer.last_seen_at.getTime() <= activeLeaseCutoff.getTime()) fail(404, 'PEER_EXPIRED');
    const update = await this.peers.update({
      id: peerId, session_id: sessionId, user_id: userId, status: 'active', last_seen_at: MoreThan(activeLeaseCutoff),
    }, { last_seen_at: now });
    if (!update.affected) fail(404, 'PEER_EXPIRED');
    await this.redis.set(`multiplayer:peer:${peerId}`, JSON.stringify({ peer_id: peerId, session_id: sessionId, user_id: userId, client_id: peer.client_id }), PRESENCE_TTL_SECONDS);
    return { peer_id: peerId, heartbeat_interval: 30, expires_in: PRESENCE_TTL_SECONDS };
  }

  async leaveSession(userId: number, sessionId: string) {
    await this.findActiveSession(sessionId);
    const peer = await this.peers.findOne({ where: { session_id: sessionId, user_id: userId, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } });
    if (!peer) fail(404, 'PEER_NOT_FOUND');
    const result = await this.withRelayLock(`multiplayer:relay:peer-lock:${peer.id}`, async () => {
      const currentPeer = await this.peers.findOneBy({ id: peer.id, user_id: userId });
      if (!currentPeer || !MULTIPLAYER_CAPACITY_PEER_STATUSES.some((status) => status === currentPeer.status)) fail(404, 'PEER_NOT_FOUND');
      if (currentPeer.role === 'owner') {
        const now = new Date();
        let wasConnected = false;
        if (currentPeer.status !== 'disconnected') {
          const disconnected = await this.peers.update(
            { id: currentPeer.id, status: In(['joining', 'active']) },
            { status: 'disconnected', last_seen_at: now },
          );
          wasConnected = !!disconnected.affected;
        }
        if (wasConnected) {
          const closing = await this.sessions.update(
            { id: sessionId, status: 'active' },
            { status: 'closing', close_after: new Date(now.getTime() + OWNER_GRACE_MS) },
          );
          if (closing.affected) {
            await this.realtime.emitSession(sessionId, 'session.updated', { session_id: sessionId, status: 'closing', grace_seconds: 60 });
          }
        } else {
          await this.ensureStaleOwnerSessionClosing(currentPeer, now);
        }
        if (wasConnected) await this.realtime.emitSession(sessionId, 'peer.disconnected', { session_id: sessionId, peer_id: currentPeer.id });
        await this.cleanupDisconnectedPeerResources(currentPeer);
        return { status: 'closing', grace_seconds: 60 };
      }
      currentPeer.status = 'left';
      await this.peers.save(currentPeer);
      await this.redis.del(`multiplayer:peer:${currentPeer.id}`);
      await this.clearCandidates(sessionId, currentPeer.id);
      await this.revokeRelayAllocationsForPeer(currentPeer.id);
      await this.realtime.emitSession(sessionId, 'peer.left', { session_id: sessionId, peer_id: currentPeer.id });
      return { status: 'left' };
    });
    if (!result) fail(429, 'RATE_LIMITED');
    return result;
  }

  async listPeers(userId: number, sessionId: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    await this.findActiveSession(sessionId);
    await this.requireActivePeer(userId, sessionId);
    const rows = await this.peers.find({ where: { session_id: sessionId, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) }, order: { joined_at: 'ASC' } });
    return rows.map((row) => this.toPublicPeer(row));
  }

  async addCandidate(userId: number, sessionId: string, dto: CandidatePayloadDto) {
    await this.requireEnabled('multiplayer_sessions_v1');
    const peer = await this.requireActivePeer(userId, sessionId);
    if (isIP(dto.address) === 0 && !/^[a-zA-Z0-9._:-]{1,255}$/.test(dto.address)) fail(400, 'CANDIDATE_INVALID');
    const metadata = dto.metadata ?? {};
    if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > MAX_CANDIDATE_METADATA_BYTES) fail(400, 'CANDIDATE_INVALID');
    const key = `multiplayer:candidates:${sessionId}:${peer.id}`;
    const existing = await this.redis.hgetall(key);
    const duplicate = Object.entries(existing).find(([, value]) => {
      try {
        const candidate = JSON.parse(value) as CandidateRecord;
        return candidate.kind === dto.kind && candidate.transport === dto.transport
          && candidate.address === dto.address && candidate.port === dto.port;
      } catch {
        return false;
      }
    });
    if (duplicate) {
      const [candidateId, value] = duplicate;
      try {
        const record = JSON.parse(value) as CandidateRecord;
        if (record.priority !== (dto.priority ?? 0) || JSON.stringify(record.metadata ?? {}) !== JSON.stringify(metadata)) {
          record.priority = dto.priority ?? 0;
          record.metadata = metadata;
          await this.redis.hset(key, candidateId, JSON.stringify(record));
        }
      } catch {
        // Replace a corrupt matching field with a valid Candidate record.
        const record: CandidateRecord = {
          candidate_id: candidateId,
          peer_id: peer.id,
          kind: dto.kind,
          transport: dto.transport,
          address: dto.address,
          port: dto.port,
          priority: dto.priority ?? 0,
          metadata,
          created_at: Date.now(),
        };
        await this.redis.hset(key, candidateId, JSON.stringify(record));
      }
      await this.redis.expire(key, PRESENCE_TTL_SECONDS);
      return { candidate_id: candidateId, expires_in: PRESENCE_TTL_SECONDS };
    }
    if (Object.keys(existing).length >= MAX_CANDIDATES_PER_PEER) fail(429, 'CANDIDATE_LIMIT_REACHED');
    const candidateId = opaqueId('cnd');
    const record: CandidateRecord = {
      candidate_id: candidateId,
      peer_id: peer.id,
      kind: dto.kind,
      transport: dto.transport,
      address: dto.address,
      port: dto.port,
      priority: dto.priority ?? 0,
      metadata,
      created_at: Date.now(),
    };
    await this.redis.hset(key, candidateId, JSON.stringify(record));
    await this.redis.expire(key, PRESENCE_TTL_SECONDS);
    await this.realtime.emitSession(sessionId, 'candidate.created', { session_id: sessionId, peer_id: peer.id, candidate_id: candidateId, candidate: record });
    return { candidate_id: candidateId, expires_in: PRESENCE_TTL_SECONDS };
  }

  async removeCandidate(userId: number, sessionId: string, candidateId: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    const peer = await this.requireActivePeer(userId, sessionId);
    const key = `multiplayer:candidates:${sessionId}:${peer.id}`;
    const removed = await this.redis.hdel(key, candidateId);
    if (!removed) fail(404, 'CANDIDATE_INVALID');
    await this.realtime.emitSession(sessionId, 'candidate.removed', { session_id: sessionId, peer_id: peer.id, candidate_id: candidateId });
    return { removed: true };
  }

  async getCandidates(userId: number, sessionId: string, targetPeerId: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    await this.requireActivePeer(userId, sessionId);
    const target = await this.peers.findOne({ where: { id: targetPeerId, session_id: sessionId, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } });
    if (!target) fail(404, 'PEER_NOT_FOUND');
    const raw = await this.redis.hgetall(`multiplayer:candidates:${sessionId}:${targetPeerId}`);
    return Object.values(raw).flatMap((value) => {
      try { return [JSON.parse(value) as CandidateRecord]; } catch { return []; }
    });
  }

  async createInvite(senderId: number, input: CreateMultiplayerInviteDto) {
    await this.requireEnabled('multiplayer_sessions_v1');
    await this.requireEnabled('multiplayer_invites_v1');
    const session = await this.findActiveSession(input.session_id);
    await this.requireActivePeer(senderId, session.id);
    const target = await this.users.findOne({ where: { id: input.target_user_id }, select: ['id', 'username'] });
    if (!target) fail(404, 'INVITE_NOT_FOUND');
    const denial = await this.invitePolicy.denialCode(senderId, target.id, session);
    if (denial) this.failPolicy(denial);
    const invite = await this.invites.save(this.invites.create({
      id: opaqueId('inv'), session_id: session.id, sender_user_id: senderId, target_user_id: target.id,
      status: 'pending', expires_at: new Date(Date.now() + INVITE_TTL_MS),
    }));
    await this.auditEvent(senderId, 'invite.created', 'invite', invite.id, { session_id: session.id });
    await this.notifications.create({ user_id: target.id, type: 'multiplayer_invite', actor_id: senderId,
      content: `你收到一个 ${session.activity_name || session.game_id} 联机邀请`, emailEvent: false });
    await this.realtime.emitUser(target.id, 'multiplayer.invite.created', { invite_id: invite.id, session_id: session.id, sender_user_id: senderId });
    return this.toPublicInvite(invite, session);
  }

  async listInvites(userId: number) {
    await this.requireEnabled('multiplayer_sessions_v1');
    await this.requireEnabled('multiplayer_invites_v1');
    const rows = await this.invites.find({ where: { target_user_id: userId, status: 'pending' }, order: { created_at: 'DESC' }, take: 50 });
    return Promise.all(rows.map(async (invite) => this.toPublicInvite(invite, await this.sessions.findOneBy({ id: invite.session_id }))));
  }

  async acceptInvite(userId: number, inviteId: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    await this.requireEnabled('multiplayer_invites_v1');
    const current = await this.invites.findOneBy({ id: inviteId, target_user_id: userId });
    if (!current) fail(404, 'INVITE_NOT_FOUND');
    if (current.status === 'pending') {
      if (current.expires_at.getTime() <= Date.now()) {
        await this.invites.update({ id: current.id, status: 'pending' }, { status: 'expired' });
        fail(410, 'INVITE_EXPIRED');
      }
      await this.assertCanJoin(userId, await this.findActiveSession(current.session_id), true);
    } else if (current.status !== 'accepted') {
      fail(404, 'INVITE_NOT_FOUND');
    }

    const accepted = await this.dataSource.transaction(async (manager) => {
      const invite = await manager.createQueryBuilder(MultiplayerInvite, 'invite')
        .setLock('pessimistic_write')
        .where('invite.id = :inviteId AND invite.target_user_id = :userId', { inviteId, userId })
        .getOne();
      if (!invite) fail(404, 'INVITE_NOT_FOUND');
      if (invite.status === 'accepted') {
        // Lock order for accepted retries is Invite -> JoinIntent -> Session.
        // consumeJoinIntent uses JoinIntent -> Session, so both flows share the
        // same suffix order and cannot deadlock each other.
        const intent = await this.ensureAcceptedInviteJoinIntent(manager, invite, userId);
        return { invite, intent, expired: false };
      }
      if (invite.status !== 'pending') fail(404, 'INVITE_NOT_FOUND');
      if (invite.expires_at.getTime() <= Date.now()) {
        invite.status = 'expired';
        await manager.save(MultiplayerInvite, invite);
        return { invite, intent: null, expired: true };
      }
      const intent = await this.ensureAcceptedInviteJoinIntent(manager, invite, userId);
      invite.status = 'accepted';
      await manager.save(MultiplayerInvite, invite);
      return { invite, intent, expired: false };
    });
    if (accepted.expired) fail(410, 'INVITE_EXPIRED');
    if (!accepted.intent) fail(410, 'INVITE_ALREADY_ACCEPTED');
    const intentId = this.acceptedInviteJoinIntentId(accepted.intent);
    // Re-emit on idempotent retries too: a previous response may have lost the
    // realtime side effect after the accepted+intent transaction committed.
    await this.realtime.emitUser(accepted.invite.sender_user_id, 'multiplayer.invite.accepted', {
      invite_id: accepted.invite.id, session_id: accepted.invite.session_id,
    });
    return {
      invite_id: accepted.invite.id,
      status: accepted.invite.status,
      join_intent: { intent_id: intentId, expires_in: Math.max(0, Math.ceil((accepted.intent.expires_at.getTime() - Date.now()) / 1000)) },
    };
  }

  /**
   * Finds or renews the single durable Join Intent for an accepted Invite.
   * A consumed result is immutable; only an absent or expired, unconsumed row
   * may be issued. Call with the Invite row already locked.
   */
  private async ensureAcceptedInviteJoinIntent(
    manager: EntityManager,
    invite: MultiplayerInvite,
    userId: number,
  ): Promise<MultiplayerJoinIntent> {
    // The Invite lock serializes accept/retry calls for this ID. Avoid a
    // pessimistic gap lock when no child exists; it would make simultaneous
    // accepts for different invites to the same Session prone to insert deadlocks.
    const visibleIntent = await manager.findOneBy(MultiplayerJoinIntent, { invite_id: invite.id });
    let intent = visibleIntent
      ? await manager.createQueryBuilder(MultiplayerJoinIntent, 'join_intent')
        .setLock('pessimistic_write')
        .where('join_intent.intent_hash = :intentHash', { intentHash: visibleIntent.intent_hash })
        .getOne()
      : null;
    if (visibleIntent && !intent) fail(410, 'INVITE_ALREADY_ACCEPTED');
    if (intent && (intent.user_id !== userId || intent.session_id !== invite.session_id || intent.invite_id !== invite.id)) {
      fail(410, 'INVITE_ALREADY_ACCEPTED');
    }
    const now = new Date();
    if (intent && (intent.consumed_at || intent.expires_at.getTime() > now.getTime())) return intent;

    // Keep the consume lock suffix order JoinIntent -> Session. Pending accepts
    // have no existing JoinIntent row, while consume cannot see the new row
    // until this transaction commits.
    const session = await manager.findOne(MultiplayerSession, {
      where: { id: invite.session_id }, lock: { mode: 'pessimistic_write' },
    });
    if (!session || session.status !== 'active' || session.expires_at.getTime() <= now.getTime()) fail(404, 'SESSION_CLOSED');

    const issuedAt = new Date(Math.floor(now.getTime() / 1000) * 1000);
    const expiresAt = new Date(issuedAt.getTime() + JOIN_INTENT_TTL_SECONDS * 1000);
    const candidate = intent || manager.create(MultiplayerJoinIntent, {
      intent_hash: '', session_id: invite.session_id, user_id: userId, invite_id: invite.id,
      allow_join_policy_bypass: true, issued_at: issuedAt, expires_at: expiresAt,
      consumed_client_id: null, consumed_peer_id: null, consumed_at: null, recovery_expires_at: null,
    });
    candidate.allow_join_policy_bypass = true;
    candidate.issued_at = issuedAt;
    candidate.expires_at = expiresAt;
    const intentId = this.acceptedInviteJoinIntentId(candidate);
    const nextHash = sha256(intentId);

    if (!intent) {
      candidate.intent_hash = nextHash;
      intent = await manager.save(MultiplayerJoinIntent, candidate);
      await manager.save(MultiplayerAuditLog, manager.create(MultiplayerAuditLog, {
        actor_user_id: userId, action: 'join_intent.created', target_type: 'session', target_id: invite.session_id,
        details: { source: 'invite', invite_id: invite.id },
      }));
      return intent;
    }

    const previousHash = intent.intent_hash;
    const rotated = await manager.createQueryBuilder()
      .update(MultiplayerJoinIntent)
      .set({
        intent_hash: nextHash,
        allow_join_policy_bypass: true,
        issued_at: issuedAt,
        expires_at: expiresAt,
        consumed_client_id: null,
        consumed_peer_id: null,
        consumed_at: null,
        recovery_expires_at: null,
      })
      .where('intent_hash = :previousHash AND invite_id = :inviteId AND consumed_at IS NULL', {
        previousHash, inviteId: invite.id,
      })
      .execute();
    if (!rotated.affected) fail(410, 'INVITE_ALREADY_ACCEPTED');
    intent.intent_hash = nextHash;
    intent.allow_join_policy_bypass = true;
    intent.issued_at = issuedAt;
    intent.expires_at = expiresAt;
    intent.consumed_client_id = null;
    intent.consumed_peer_id = null;
    intent.consumed_at = null;
    intent.recovery_expires_at = null;
    await manager.save(MultiplayerAuditLog, manager.create(MultiplayerAuditLog, {
      actor_user_id: userId, action: 'join_intent.renewed', target_type: 'session', target_id: invite.session_id,
      details: { source: 'invite', invite_id: invite.id },
    }));
    return intent;
  }

  async declineInvite(userId: number, inviteId: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    await this.requireEnabled('multiplayer_invites_v1');
    const invite = await this.invites.findOneBy({ id: inviteId, target_user_id: userId, status: 'pending' });
    if (!invite) fail(404, 'INVITE_NOT_FOUND');
    if (invite.expires_at.getTime() <= Date.now()) { invite.status = 'expired'; await this.invites.save(invite); fail(410, 'INVITE_EXPIRED'); }
    invite.status = 'declined';
    await this.invites.save(invite);
    await this.realtime.emitUser(invite.sender_user_id, 'multiplayer.invite.revoked', { invite_id: invite.id, session_id: invite.session_id });
    return { status: invite.status };
  }

  async revokeInvite(senderId: number, inviteId: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    await this.requireEnabled('multiplayer_invites_v1');
    const invite = await this.invites.findOneBy({ id: inviteId, sender_user_id: senderId, status: 'pending' });
    if (!invite) fail(404, 'INVITE_NOT_FOUND');
    invite.status = 'revoked';
    await this.invites.save(invite);
    await this.realtime.emitUser(invite.target_user_id, 'multiplayer.invite.revoked', { invite_id: invite.id, session_id: invite.session_id });
    return { status: invite.status };
  }

  async createJoinRequest(requesterId: number, sessionId: string, requesterClientId = 'forum_web') {
    await this.requireEnabled('multiplayer_sessions_v1');
    await this.requireEnabled('multiplayer_invites_v1');
    const session = await this.findActiveSession(sessionId);
    const denial = await this.sessionPolicy.joinRequestDenialCode(requesterId, session);
    if (denial) this.failPolicy(denial);
    const existing = await this.joinRequests.findOne({ where: { session_id: sessionId, requester_user_id: requesterId, status: 'pending' } });
    if (existing && existing.expires_at.getTime() > Date.now()) return existing;
    const row = await this.joinRequests.save(this.joinRequests.create({
      id: opaqueId('jrq'), session_id: sessionId, requester_user_id: requesterId, target_user_id: session.owner_user_id,
      requester_client_id: String(requesterClientId || 'forum_web').slice(0, 128),
      status: 'pending', expires_at: new Date(Date.now() + JOIN_REQUEST_TTL_MS),
    }));
    await this.notifications.create({ user_id: session.owner_user_id, type: 'multiplayer_join_request', actor_id: requesterId,
      content: '有人请求加入你的联机 Session', emailEvent: false });
    await this.realtime.emitUser(session.owner_user_id, 'multiplayer.join_request.created', { join_request_id: row.id, session_id: sessionId, requester_user_id: requesterId });
    return { join_request_id: row.id, status: row.status, expires_at: row.expires_at };
  }

  async approveJoinRequest(ownerId: number, requestId: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    await this.requireEnabled('multiplayer_invites_v1');
    const current = await this.joinRequests.findOneBy({ id: requestId, target_user_id: ownerId });
    if (!current || !['pending', 'approved'].includes(current.status)) fail(410, 'JOIN_REQUEST_EXPIRED');
    if (current.status === 'pending') {
      if (current.expires_at.getTime() <= Date.now()) {
        await this.joinRequests.update({ id: current.id, target_user_id: ownerId, status: 'pending' }, { status: 'expired' });
        fail(410, 'JOIN_REQUEST_EXPIRED');
      }
      const session = await this.findActiveSession(current.session_id);
      const denial = await this.sessionPolicy.joinDenialCode(current.requester_user_id, session, { viaInviteOrApproval: true });
      if (denial) this.failPolicy(denial);
    }

    const row = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.createQueryBuilder(MultiplayerJoinRequest, 'join_request')
        .setLock('pessimistic_write')
        .where('join_request.id = :requestId AND join_request.target_user_id = :ownerId', { requestId, ownerId })
        .getOne();
      if (!locked || !['pending', 'approved'].includes(locked.status)) fail(410, 'JOIN_REQUEST_EXPIRED');
      if (locked.status === 'approved') {
        if (!locked.join_intent_expires_at || locked.join_intent_expires_at.getTime() <= Date.now()) fail(410, 'JOIN_REQUEST_EXPIRED');
        return locked;
      }
      // These timestamps participate in the deterministic intent HMAC. MySQL
      // DATETIME has second precision here, so normalize before persisting.
      const now = new Date(Math.floor(Date.now() / 1000) * 1000);
      if (locked.expires_at.getTime() <= now.getTime()) {
        locked.status = 'expired';
        await manager.save(MultiplayerJoinRequest, locked);
        return null;
      }
      locked.status = 'approved';
      locked.approved_at = now;
      locked.join_intent_expires_at = new Date(now.getTime() + APPROVED_JOIN_INTENT_TTL_MS);
      locked.join_intent_hash = sha256(this.approvedJoinIntentId(locked));
      locked.realtime_acknowledged_at = null;
      locked.realtime_last_published_at = null;
      return manager.save(MultiplayerJoinRequest, locked);
    });
    if (!row) fail(410, 'JOIN_REQUEST_EXPIRED');
    await this.publishPendingJoinApprovals(row.requester_user_id, row.requester_client_id, true);
    return { status: row.status, join_intent: { intent_id: this.approvedJoinIntentId(row), expires_in: Math.max(0, Math.ceil((row.join_intent_expires_at!.getTime() - Date.now()) / 1000)) } };
  }

  async rejectJoinRequest(ownerId: number, requestId: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    await this.requireEnabled('multiplayer_invites_v1');
    const row = await this.joinRequests.findOneBy({ id: requestId, target_user_id: ownerId, status: 'pending' });
    if (!row) fail(410, 'JOIN_REQUEST_EXPIRED');
    if (row.expires_at.getTime() <= Date.now()) { row.status = 'expired'; await this.joinRequests.save(row); fail(410, 'JOIN_REQUEST_EXPIRED'); }
    row.status = 'rejected';
    await this.joinRequests.save(row);
    await this.realtime.emitUser(row.requester_user_id, 'multiplayer.join_request.rejected', { join_request_id: row.id, session_id: row.session_id });
    return { status: row.status };
  }

  async createJoinIntent(userId: number, sessionId: string, joinCode?: string, allowApproved = false) {
    await this.requireEnabled('multiplayer_sessions_v1');
    const session = await this.findActiveSession(sessionId);
    const codeAuthorized = !!joinCode && !!session.code_hash && timingSafeEqual(
      Buffer.from(sha256(joinCode.trim().toUpperCase()), 'hex'), Buffer.from(session.code_hash, 'hex'),
    );
    if (joinCode && !codeAuthorized) fail(403, 'SESSION_PERMISSION_DENIED');
    await this.assertCanJoin(userId, session, allowApproved, codeAuthorized);
    this.joinRecoveryKey('approved-resume');
    const intentId = opaqueId('jnt');
    const issuedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    const intent = this.joinIntents.create({
      intent_hash: sha256(intentId), session_id: sessionId, user_id: userId, invite_id: null,
      // The issuance path has already checked visibility/join policy; keep
      // the previous consume behavior, which treated every issued Intent as
      // authorization after this point.
      allow_join_policy_bypass: true,
      issued_at: issuedAt, expires_at: new Date(issuedAt.getTime() + JOIN_INTENT_TTL_SECONDS * 1000),
      consumed_client_id: null, consumed_peer_id: null, consumed_at: null, recovery_expires_at: null,
    });
    await this.dataSource.transaction(async (manager) => {
      await manager.save(MultiplayerJoinIntent, intent);
      await manager.save(MultiplayerAuditLog, manager.create(MultiplayerAuditLog, {
        actor_user_id: userId, action: 'join_intent.created', target_type: 'session', target_id: sessionId,
        details: { source: 'direct' },
      }));
    });
    return { intent_id: intentId, expires_in: JOIN_INTENT_TTL_SECONDS };
  }

  async consumeJoinIntent(userId: number, clientId: string, intentId: string, capabilities?: Record<string, unknown>) {
    const intentHash = sha256(intentId);
    const approvedRequest = await this.joinRequests.findOneBy({ join_intent_hash: intentHash });
    if (approvedRequest) return this.consumeApprovedJoinIntent(userId, clientId, intentId, approvedRequest.id, capabilities);

    const durableIntent = await this.joinIntents.findOneBy({ intent_hash: intentHash });
    if (durableIntent) return this.consumeDurableJoinIntent(userId, clientId, intentId, durableIntent, capabilities);

    // A rolling deployment may still receive a 60-second intent issued by the
    // old process before the durable table was introduced.
    const key = `multiplayer:join-intent:${intentId}`;
    const current = await this.redis.get(key);
    if (!current) fail(410, 'JOIN_INTENT_EXPIRED');
    const prefix = `${userId}:`;
    if (!current.startsWith(prefix)) fail(403, 'JOIN_INTENT_INVALID');
    const taken = await this.redis.getAndDeleteIfMatches(key, prefix);
    if (!taken) fail(409, 'JOIN_INTENT_CONSUMED');
    let payload: { user_id: number; session_id: string; approved_join: boolean };
    try { payload = JSON.parse(taken.slice(prefix.length)); } catch { fail(403, 'JOIN_INTENT_INVALID'); }
    if (payload.user_id !== userId) fail(403, 'JOIN_INTENT_INVALID');
    return this.joinSession(userId, clientId, payload.session_id, { capabilities }, payload.approved_join === true);
  }

  private async consumeDurableJoinIntent(
    userId: number,
    clientId: string,
    intentId: string,
    current: MultiplayerJoinIntent,
    capabilities?: Record<string, unknown>,
  ) {
    await this.requireEnabled('multiplayer_sessions_v1');
    if (current.user_id !== userId) fail(403, 'JOIN_INTENT_INVALID');

    let policyError: unknown = null;
    if (!current.consumed_at) {
      try {
        const session = await this.findActiveSession(current.session_id);
        await this.assertCanJoin(userId, session, current.allow_join_policy_bypass);
      } catch (error) {
        policyError = error;
      }
    }

    // Fail closed before committing the one-time consume if the stable key is
    // unavailable; otherwise a Peer could be created without a recoverable token.
    this.joinRecoveryKey('approved-resume');
    const result = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.createQueryBuilder(MultiplayerJoinIntent, 'join_intent')
        .setLock('pessimistic_write')
        .where('join_intent.intent_hash = :intentHash', { intentHash: sha256(intentId) })
        .getOne();
      if (!locked) fail(410, 'JOIN_INTENT_EXPIRED');
      if (locked.user_id !== userId) fail(403, 'JOIN_INTENT_INVALID');
      const now = new Date();

      if (locked.consumed_at) {
        if (!locked.recovery_expires_at || locked.recovery_expires_at.getTime() <= now.getTime()
          || !locked.consumed_peer_id) fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
        if (locked.consumed_client_id !== clientId) fail(403, 'JOIN_INTENT_CLIENT_MISMATCH');
        const peer = await manager.findOne(MultiplayerPeer, {
          where: { id: locked.consumed_peer_id, session_id: locked.session_id, user_id: userId, client_id: clientId },
        });
        if (!peer || !['active', 'disconnected'].includes(peer.status)) fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
        const session = await manager.findOneBy(MultiplayerSession, { id: locked.session_id });
        if (!session || session.status === 'closed' || session.expires_at.getTime() <= now.getTime()
          || (session.status === 'closing' && (!session.close_after || session.close_after.getTime() <= now.getTime()))) {
          fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
        }
        const stableResumeToken = this.approvedResumeToken(intentId, userId, clientId, peer.id);
        const token = await manager.findOne(MultiplayerPeerResumeToken, {
          where: { peer_id: peer.id, token_hash: sha256(stableResumeToken) },
        });
        if (!token || token.expires_at.getTime() <= now.getTime()) fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
        return { peer, resumeToken: stableResumeToken, sessionOwnerUserId: session.owner_user_id };
      }

      if (locked.expires_at.getTime() <= now.getTime()) fail(410, 'JOIN_INTENT_EXPIRED');
      if (policyError) throw policyError;
      const session = await manager.findOne(MultiplayerSession, {
        where: { id: locked.session_id }, lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.status !== 'active' || session.expires_at.getTime() <= now.getTime()) fail(404, 'SESSION_CLOSED');
      const existing = await manager.findOne(MultiplayerPeer, {
        where: { session_id: session.id, user_id: userId, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) },
      });
      if (existing) fail(400, 'SESSION_NOT_JOINABLE');
      const count = await manager.count(MultiplayerPeer, {
        where: { session_id: session.id, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) },
      });
      if (count >= session.max_players) fail(409, 'SESSION_FULL');

      const peerId = opaqueId('peer');
      const tokenValue = this.approvedResumeToken(intentId, userId, clientId, peerId);
      const peer = manager.create(MultiplayerPeer, {
        id: peerId, session_id: session.id, user_id: userId, client_id: clientId,
        role: 'member', status: 'active', capabilities: capabilities || null, last_seen_at: now,
      });
      await manager.save(MultiplayerPeer, peer);
      await manager.save(MultiplayerPeerResumeToken, manager.create(MultiplayerPeerResumeToken, {
        peer_id: peerId, token_hash: sha256(tokenValue), expires_at: session.expires_at, consumed_at: null,
      }));
      locked.consumed_client_id = clientId;
      locked.consumed_peer_id = peerId;
      locked.consumed_at = now;
      locked.recovery_expires_at = new Date(now.getTime() + APPROVED_JOIN_RESULT_RECOVERY_MS);
      await manager.save(MultiplayerJoinIntent, locked);
      await manager.save(MultiplayerAuditLog, manager.create(MultiplayerAuditLog, {
        actor_user_id: userId, action: 'peer.joined', target_type: 'session', target_id: session.id,
        details: { peer_id: peerId, join_intent_hash: locked.intent_hash },
      }));
      return { peer, resumeToken: tokenValue, sessionOwnerUserId: session.owner_user_id };
    });

    // Match Peer state while holding the same lock as leave/cleanup. A competing
    // leave can win after the DB transaction; never recreate cache for a Peer it left.
    const repairedPeer = await this.withRelayLock(`multiplayer:relay:peer-lock:${result.peer.id}`, async () => {
      const peer = await this.peers.findOneBy({ id: result.peer.id, session_id: result.peer.session_id, user_id });
      if (!peer || !['active', 'disconnected'].includes(peer.status)) fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
      const refreshedAt = new Date();
      const activated = await this.peers.update({
        id: peer.id, session_id: peer.session_id, user_id, status: In(['active', 'disconnected']),
      }, { status: 'active', last_seen_at: refreshedAt });
      if (!activated.affected) fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
      peer.status = 'active';
      peer.last_seen_at = refreshedAt;
      await this.redis.del(`multiplayer:peer-cleanup:${peer.id}`);
      await this.redis.set(`multiplayer:peer:${peer.id}`, JSON.stringify({
        peer_id: peer.id, session_id: peer.session_id, user_id, client_id: peer.client_id,
      }), PRESENCE_TTL_SECONDS);
      await this.clearCandidates(peer.session_id, peer.id);
      await this.realtime.emitSession(peer.session_id, 'peer.joined', {
        session_id: peer.session_id, peer_id: peer.id, user_id,
      });
      if (result.sessionOwnerUserId) {
        await this.realtime.emitUser(result.sessionOwnerUserId, 'session.updated', {
          session_id: peer.session_id, status: 'active',
        });
      }
      return peer;
    });
    if (!repairedPeer) fail(429, 'RATE_LIMITED');
    return { peer: this.toPublicPeer(repairedPeer), resume_token: result.resumeToken };
  }

  /**
   * Re-emits pending approvals from the same row that commits status=approved.
   * The row is the durable outbox: a failed Redis append only delays another
   * attempt and can never lose an approval across a process restart.
   */
  async publishPendingJoinApprovals(userId: number, clientId: string, force = false): Promise<void> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - APPROVED_JOIN_EVENT_RETRY_MS);
    const rows = await this.joinRequests.createQueryBuilder('join_request')
      .where('join_request.requester_user_id = :userId', { userId })
      .andWhere('join_request.requester_client_id = :clientId', { clientId })
      .andWhere("join_request.status = 'approved'")
      .andWhere('join_request.realtime_acknowledged_at IS NULL')
      .andWhere('((join_request.consumed_peer_id IS NULL AND join_request.join_intent_expires_at > :now) OR (join_request.consumed_peer_id IS NOT NULL AND join_request.recovery_expires_at > :now))', { now })
      // Filter retry throttling before take(50), so recently published old rows
      // cannot permanently occupy the page and starve later approvals.
      .andWhere(force ? '1 = 1' : '(join_request.realtime_last_published_at IS NULL OR join_request.realtime_last_published_at <= :cutoff)', { cutoff })
      // MySQL sorts NULL first for ASC: unsent and least-recently-sent records
      // move ahead of the previous page after their publish lease is updated.
      // force skips only the cooldown, not the 50-row batch limit or this rotation.
      .orderBy('join_request.realtime_last_published_at', 'ASC')
      .addOrderBy('join_request.approved_at', 'ASC')
      .take(50)
      .getMany();

    for (const row of rows) {
      if (!row.join_intent_hash || !row.join_intent_expires_at) continue;
      if (!force && row.realtime_last_published_at && row.realtime_last_published_at.getTime() > cutoff.getTime()) continue;
      const update = await this.joinRequests.createQueryBuilder()
        .update(MultiplayerJoinRequest)
        .set({ realtime_last_published_at: now })
        .where('id = :id AND realtime_acknowledged_at IS NULL', { id: row.id })
        .andWhere('((consumed_peer_id IS NULL AND join_intent_expires_at > :now) OR (consumed_peer_id IS NOT NULL AND recovery_expires_at > :now))', { now })
        .andWhere(force ? '1 = 1' : '(realtime_last_published_at IS NULL OR realtime_last_published_at <= :cutoff)', { cutoff })
        .execute();
      if (!update.affected) continue;
      await this.realtime.emitUser(userId, 'multiplayer.join_request.approved', {
        join_request_id: row.id,
        session_id: row.session_id,
        intent_id: this.approvedJoinIntentId(row),
      });
    }
  }

  async acknowledgeJoinApproval(userId: number, clientId: string, requestId: string): Promise<void> {
    await this.joinRequests.createQueryBuilder()
      .update(MultiplayerJoinRequest)
      .set({ realtime_acknowledged_at: new Date() })
      .where('id = :requestId AND requester_user_id = :userId AND requester_client_id = :clientId', { requestId, userId, clientId })
      .andWhere("status = 'approved' AND realtime_acknowledged_at IS NULL")
      .execute();
  }

  private joinRecoveryKey(purpose: 'approved-intent' | 'approved-resume' | 'invite-intent'): Buffer {
    const source = this.config.get<string>('multiplayer.relayCredentialSecret')
      || this.config.get<string>('mindauth.nativeExchangeSecret')
      || (process.env.NODE_ENV === 'production' ? '' : 'development-only-multiplayer-join-recovery-secret');
    if (!source || source.length < 32) fail(503, 'JOIN_INTENT_RECOVERY_UNAVAILABLE');
    return createHmac('sha256', source).update(`mindfourm/multiplayer/${purpose}/v1`).digest();
  }

  private acceptedInviteJoinIntentId(intent: Pick<MultiplayerJoinIntent,
    'invite_id' | 'user_id' | 'session_id' | 'issued_at' | 'expires_at'>): string {
    if (!intent.invite_id) fail(410, 'INVITE_ALREADY_ACCEPTED');
    const payload = [intent.invite_id, intent.user_id, intent.session_id,
      intent.issued_at.getTime(), intent.expires_at.getTime()].join('\0');
    return `jnt_${createHmac('sha256', this.joinRecoveryKey('invite-intent')).update(payload).digest().subarray(0, 24).toString('base64url')}`;
  }

  private approvedJoinIntentId(request: MultiplayerJoinRequest): string {
    if (!request.approved_at || !request.join_intent_expires_at) fail(410, 'JOIN_INTENT_EXPIRED');
    const payload = [request.id, request.requester_user_id, request.requester_client_id,
      request.session_id, request.approved_at.getTime(), request.join_intent_expires_at.getTime()].join('\0');
    return `jnt_${createHmac('sha256', this.joinRecoveryKey('approved-intent')).update(payload).digest().subarray(0, 24).toString('base64url')}`;
  }

  private approvedResumeToken(intentId: string, userId: number, clientId: string, peerId: string): string {
    return createHmac('sha256', this.joinRecoveryKey('approved-resume'))
      .update([intentId, userId, clientId, peerId].join('\0')).digest('base64url');
  }

  private async consumeApprovedJoinIntent(
    userId: number,
    clientId: string,
    intentId: string,
    requestId: string,
    capabilities?: Record<string, unknown>,
  ) {
    await this.requireEnabled('multiplayer_sessions_v1');
    const current = await this.joinRequests.findOneBy({ id: requestId });
    if (!current || current.join_intent_hash !== sha256(intentId)) fail(410, 'JOIN_INTENT_EXPIRED');
    if (current.requester_user_id !== userId) fail(403, 'JOIN_INTENT_INVALID');
    if (current.requester_client_id !== clientId) fail(403, 'JOIN_INTENT_CLIENT_MISMATCH');

    let policyError: unknown = null;
    if (!current.consumed_peer_id) {
      try {
        const session = await this.findActiveSession(current.session_id);
        await this.assertCanJoin(userId, session, true);
      } catch (error) {
        policyError = error;
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const locked = await manager.createQueryBuilder(MultiplayerJoinRequest, 'join_request')
        .setLock('pessimistic_write')
        .where('join_request.id = :requestId AND join_request.join_intent_hash = :intentHash', {
          requestId, intentHash: sha256(intentId),
        })
        .getOne();
      if (!locked || locked.status !== 'approved') fail(410, 'JOIN_INTENT_EXPIRED');
      if (locked.requester_user_id !== userId) fail(403, 'JOIN_INTENT_INVALID');
      if (locked.requester_client_id !== clientId) fail(403, 'JOIN_INTENT_CLIENT_MISMATCH');
      const now = new Date();

      if (locked.consumed_peer_id) {
        if (!locked.recovery_expires_at || locked.recovery_expires_at.getTime() <= now.getTime()) fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
        if (locked.consumed_client_id !== clientId) fail(403, 'JOIN_INTENT_CLIENT_MISMATCH');
        const peer = await manager.findOne(MultiplayerPeer, {
          where: { id: locked.consumed_peer_id, session_id: locked.session_id, user_id, client_id },
        });
        if (!peer || !['active', 'disconnected'].includes(peer.status)) fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
        const session = await manager.findOneBy(MultiplayerSession, { id: locked.session_id });
        if (!session || session.status === 'closed' || session.expires_at.getTime() <= now.getTime()
          || (session.status === 'closing' && (!session.close_after || session.close_after.getTime() <= now.getTime()))) {
          fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
        }
        const resumeToken = this.approvedResumeToken(intentId, userId, clientId, peer.id);
        const token = await manager.findOne(MultiplayerPeerResumeToken, {
          where: { peer_id: peer.id, token_hash: sha256(resumeToken), consumed_at: IsNull() },
        });
        if (!token || token.expires_at.getTime() <= now.getTime()) fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
        await manager.update(MultiplayerPeer, { id: peer.id, status: In(['active', 'disconnected']) }, {
          status: 'active', last_seen_at: now,
        });
        peer.status = 'active';
        peer.last_seen_at = now;
        return { peer, resumeToken, sessionOwnerUserId: session.owner_user_id };
      }

      if (!locked.join_intent_expires_at || locked.join_intent_expires_at.getTime() <= now.getTime()) fail(410, 'JOIN_INTENT_EXPIRED');
      if (policyError) throw policyError;
      const session = await manager.findOne(MultiplayerSession, {
        where: { id: locked.session_id }, lock: { mode: 'pessimistic_write' },
      });
      if (!session || session.status !== 'active' || session.expires_at.getTime() <= now.getTime()) fail(404, 'SESSION_CLOSED');
      const existing = await manager.findOne(MultiplayerPeer, {
        where: { session_id: session.id, user_id, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) },
      });
      if (existing) fail(400, 'SESSION_NOT_JOINABLE');
      const count = await manager.count(MultiplayerPeer, {
        where: { session_id: session.id, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) },
      });
      if (count >= session.max_players) fail(409, 'SESSION_FULL');

      const peerId = opaqueId('peer');
      const resumeToken = this.approvedResumeToken(intentId, userId, clientId, peerId);
      const peer = manager.create(MultiplayerPeer, {
        id: peerId, session_id: session.id, user_id: userId, client_id: clientId,
        role: 'member', status: 'active', capabilities: capabilities || null, last_seen_at: now,
      });
      await manager.save(MultiplayerPeer, peer);
      await manager.save(MultiplayerPeerResumeToken, manager.create(MultiplayerPeerResumeToken, {
        peer_id: peerId, token_hash: sha256(resumeToken), expires_at: session.expires_at, consumed_at: null,
      }));
      locked.consumed_peer_id = peerId;
      locked.consumed_client_id = clientId;
      locked.consumed_at = now;
      locked.recovery_expires_at = new Date(now.getTime() + APPROVED_JOIN_RESULT_RECOVERY_MS);
      await manager.save(MultiplayerJoinRequest, locked);
      await manager.save(MultiplayerAuditLog, manager.create(MultiplayerAuditLog, {
        actor_user_id: userId, action: 'peer.joined', target_type: 'session', target_id: session.id,
        details: { peer_id: peerId, join_request_id: locked.id },
      }));
      return { peer, resumeToken, sessionOwnerUserId: session.owner_user_id };
    });

    // Repair volatile presence/event state on every retry. These writes occur
    // after the durable peer/token/result transaction and are safe to repeat.
    const restoredPeer = await this.withRelayLock(`multiplayer:relay:peer-lock:${result.peer.id}`, async () => {
      const currentPeer = await this.peers.findOneBy({
        id: result.peer.id, session_id: result.peer.session_id, user_id: userId, client_id: clientId,
      });
      if (!currentPeer || !['active', 'disconnected'].includes(currentPeer.status)) {
        fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
      }
      const currentSession = await this.sessions.findOneBy({ id: currentPeer.session_id });
      const lockNow = new Date();
      if (!currentSession || currentSession.status === 'closed' || currentSession.expires_at.getTime() <= lockNow.getTime()
        || (currentSession.status === 'closing' && (!currentSession.close_after || currentSession.close_after.getTime() <= lockNow.getTime()))) {
        fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
      }
      if (currentPeer.status === 'disconnected') {
        const activated = await this.peers.update({ id: currentPeer.id, status: 'disconnected' }, {
          status: 'active', last_seen_at: lockNow,
        });
        if (!activated.affected) fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
        currentPeer.status = 'active';
        currentPeer.last_seen_at = lockNow;
      }
      await this.redis.del(`multiplayer:peer-cleanup:${result.peer.id}`);
      await this.redis.set(`multiplayer:peer:${result.peer.id}`, JSON.stringify({
        peer_id: result.peer.id, session_id: result.peer.session_id, user_id: userId, client_id: clientId,
      }), PRESENCE_TTL_SECONDS);
      await this.clearCandidates(result.peer.session_id, result.peer.id);
      return currentPeer;
    });
    if (!restoredPeer) fail(429, 'RATE_LIMITED');
    await this.realtime.emitSession(result.peer.session_id, 'peer.joined', {
      session_id: result.peer.session_id, peer_id: result.peer.id, user_id: userId,
    });
    if (result.sessionOwnerUserId) {
      await this.realtime.emitUser(result.sessionOwnerUserId, 'session.updated', {
        session_id: result.peer.session_id, status: 'active',
      });
    }
    const peer = await this.peers.findOneByOrFail({ id: restoredPeer.id });
    if (!['active', 'disconnected'].includes(peer.status)) fail(410, 'JOIN_INTENT_RECOVERY_EXPIRED');
    return { peer: this.toPublicPeer(peer), resume_token: result.resumeToken };
  }

  async validateActivitySession(userId: number, sessionId: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    const session = await this.findActiveSession(sessionId);
    const peer = await this.peers.findOne({ where: { session_id: sessionId, user_id: userId, status: 'active' } });
    if (!peer) fail(403, 'SESSION_PERMISSION_DENIED');
    const currentPlayers = await this.peers.count({ where: { session_id: sessionId, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } });
    return { session, peer, current_players: currentPlayers };
  }

  async actionsForActivity(viewerId: number, subjectUserId: number, sessionId: string | null) {
    return (await this.actionsForActivities(viewerId, [{ user_id: subjectUserId, session_id: sessionId }])).get(subjectUserId)
      || { can_join: false, can_request_join: false, can_invite: false, session_visible: false };
  }

  /** Batch policy evaluation for friend cards; all database reads are bounded per page. */
  async actionsForActivities(viewerId: number, items: Array<{ user_id: number; session_id: string | null }>): Promise<Map<number, { can_join: boolean; can_request_join: boolean; can_invite: boolean; invite_session_id?: string; session_visible: boolean }>> {
    const empty = () => ({ can_join: false, can_request_join: false, can_invite: false, session_visible: false });
    const result = new Map(items.map((item) => [item.user_id, empty()]));
    const targets = items.filter((item) => item.user_id !== viewerId);
    const subjectIds = [...new Set(targets.map((item) => item.user_id))];
    if (!subjectIds.length) return result;
    const [sessionsEnabled, invitesEnabled] = await Promise.all([
      this.enabled('multiplayer_sessions_v1'), this.enabled('multiplayer_invites_v1'),
    ]);
    if (!sessionsEnabled) return result;
    const eligible = targets.filter((item) => item.session_id);
    const sessionIds = [...new Set(eligible.map((item) => item.session_id!))];
    const now = new Date();
    const [sessions, participantPeers, viewerPeerRows] = await Promise.all([
      sessionIds.length ? this.sessions.find({ where: { id: In(sessionIds), status: 'active', expires_at: MoreThan(now) } }) : Promise.resolve([]),
      sessionIds.length ? this.peers.find({ where: { session_id: In(sessionIds), user_id: In(subjectIds), status: 'active' }, select: ['session_id', 'user_id'] }) : Promise.resolve([]),
      this.peers.find({ where: { user_id: viewerId, status: 'active' }, select: ['session_id'] }),
    ]);
    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    const viewerSessionIds = [...new Set(viewerPeerRows.map((peer) => peer.session_id))];
    const inviteSessions = viewerSessionIds.length ? await this.sessions.find({
      where: { id: In(viewerSessionIds), status: 'active', expires_at: MoreThan(now) },
    }) : [];
    const inviteParticipantPeers = inviteSessions.length ? await this.peers.find({
      where: { session_id: In(inviteSessions.map((session) => session.id)), user_id: In(subjectIds), status: 'active' },
      select: ['session_id', 'user_id'],
    }) : [];
    const memberKeys = new Set([...participantPeers, ...inviteParticipantPeers].map((peer) => `${peer.session_id}:${peer.user_id}`));
    const allSessionIds = [...new Set([...sessionIds, ...inviteSessions.map((session) => session.id)])];
    const occupyingPeers = allSessionIds.length ? await this.peers.find({
      where: { session_id: In(allSessionIds), status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) }, select: ['session_id'],
    }) : [];
    const occupyingCounts = new Map<string, number>();
    for (const peer of occupyingPeers) occupyingCounts.set(peer.session_id, (occupyingCounts.get(peer.session_id) || 0) + 1);
    const ownerIds = [...new Set(sessions.map((session) => session.owner_user_id))];
    const privacyTargets = [...new Set([...subjectIds, ...ownerIds])];
    const [friends, blocked, canJoinMap, canRequest, canInvite] = await Promise.all([
      this.socialPolicy.areFriendsMany(viewerId, ownerIds),
      this.socialPolicy.isBlockedMany(viewerId, privacyTargets),
      this.socialPolicy.canPerformMany(viewerId, ownerIds, 'allow_join'),
      this.socialPolicy.canPerformMany(viewerId, ownerIds, 'allow_join_request'),
      this.socialPolicy.canPerformMany(viewerId, subjectIds, 'allow_invites'),
    ]);
    const viewerSession = inviteSessions
      .filter((session) => (occupyingCounts.get(session.id) || 0) < session.max_players)
      .sort((a, b) => Number(b.owner_user_id === viewerId) - Number(a.owner_user_id === viewerId))[0];
    for (const item of targets) {
      const targetAlreadyInInviteSession = !!viewerSession && memberKeys.has(`${viewerSession.id}:${item.user_id}`);
      const inviteAction = invitesEnabled && !!viewerSession && !targetAlreadyInInviteSession && !blocked.get(item.user_id) && canInvite.get(item.user_id) === true;
      const session = sessionById.get(item.session_id!);
      if (!session || !memberKeys.has(`${session.id}:${item.user_id}`)) {
        result.set(item.user_id, {
          can_join: false,
          can_request_join: false,
          can_invite: inviteAction,
          ...(viewerSession && !targetAlreadyInInviteSession ? { invite_session_id: viewerSession.id } : {}),
          session_visible: false,
        });
        continue;
      }
      if (blocked.get(item.user_id) || blocked.get(session.owner_user_id)) continue;
      const friend = friends.get(session.owner_user_id) === true;
      const visibleScope = session.visibility === 'friends' && friend;
      const hasSpace = (occupyingCounts.get(session.id) || 0) < session.max_players;
      const canJoin = canJoinMap.get(session.owner_user_id) === true && hasSpace && visibleScope && (
        session.join_policy === 'open' || (session.join_policy === 'friends' && friend)
      );
      const canRequestJoin = invitesEnabled && hasSpace && visibleScope && session.join_policy === 'request' && canRequest.get(session.owner_user_id) === true;
      const sessionVisible = visibleScope || (session.visibility === 'unlisted' && friend);
      result.set(item.user_id, {
        can_join: canJoin,
        can_request_join: canRequestJoin,
        can_invite: inviteAction,
        ...(viewerSession && !targetAlreadyInInviteSession ? { invite_session_id: viewerSession.id } : {}),
        session_visible: sessionVisible,
      });
    }
    return result;
  }

  async allocateRelay(userId: number, sessionId: string) {
    await this.requireEnabled('multiplayer_sessions_v1');
    await this.requireEnabled('multiplayer_relay_v1');
    const session = await this.findActiveSession(sessionId);
    const peer = await this.requireActivePeer(userId, sessionId);
    const secret = this.config.get<string>('multiplayer.relayCredentialSecret') || '';
    if (secret.length < 32) fail(503, 'RELAY_UNAVAILABLE');
    const reservation = await this.withRelayLock(`multiplayer:relay:session-lock:${session.id}`, async () => {
      return this.withRelayLock(`multiplayer:relay:peer-lock:${peer.id}`, async () => {
        const now = new Date();
        const existing = await this.relayAllocations.findOne({ where: {
          peer_id: peer.id, status: In(['active', 'connected']), expires_at: MoreThan(now),
        } });
        if (existing) {
          if (existing.status !== 'connected' || !existing.connection_id) fail(429, 'RELAY_LIMIT_REACHED');
          const connectionId = existing.connection_id;
          return this.withRelayAgentLock(existing.agent_id, async () => {
            const key = `multiplayer:relay:agent:${existing.agent_id}`;
            const raw = await this.redis.get(key);
            if (!raw) return null;
            let agent: RelayAgentRecord;
            try { agent = JSON.parse(raw) as RelayAgentRecord; } catch { return null; }
            if (agent.agent_id !== existing.agent_id || !isMultiplayerV1Endpoint(agent.endpoint)) return null;
            const current = await this.relayAllocations.findOneBy({
              id: existing.id, peer_id: peer.id, agent_id: existing.agent_id, status: 'connected',
              connection_id: connectionId, expires_at: MoreThan(new Date()),
            });
            if (!current) return null;
            const pendingExpiresAt = new Date(Date.now() + RELAY_CREDENTIAL_TTL_SECONDS * 1000);
            const staged = await this.relayAllocations.update({
              id: current.id, peer_id: peer.id, agent_id: existing.agent_id, status: 'connected',
              connection_id: connectionId, expires_at: MoreThan(new Date()),
            }, { pending_expires_at: pendingExpiresAt });
            if (!staged.affected) return null;
            const renewed = await this.relayAllocations.findOneBy({
              id: current.id, peer_id: peer.id, agent_id: existing.agent_id, status: 'connected',
              connection_id: connectionId, pending_expires_at: pendingExpiresAt,
            });
            if (!renewed) return null;
            return { agent, allocationId: renewed.id, expiresAt: renewed.pending_expires_at! };
          });
        }

        // Keep all live allocations in one Session on the same Agent so that
        // the Agent can pair its authenticated WSS connections by session_id.
        const sessionAllocations = await this.relayAllocations.find({ where: {
          session_id: session.id, status: In(['active', 'connected']), expires_at: MoreThan(now),
        } });
        const liveAgentIds = [...new Set(sessionAllocations.map((allocation) => allocation.agent_id))];
        if (liveAgentIds.length > 1) fail(503, 'RELAY_UNAVAILABLE');
        const pinnedAgentId = liveAgentIds[0] || null;
        const registeredIds = pinnedAgentId
          ? [`multiplayer:relay:agent:${pinnedAgentId}`]
          : await this.redis.scanKeys('multiplayer:relay:agent:*');
        const agents: RelayAgentRecord[] = [];
        for (const key of registeredIds) {
          const raw = await this.redis.get(key);
          if (!raw) continue;
          try {
            const record = JSON.parse(raw) as RelayAgentRecord;
            if (record.agent_id && record.capacity > 0 && isMultiplayerV1Endpoint(record.endpoint)
              && (!pinnedAgentId || record.agent_id === pinnedAgentId)) {
              agents.push(record);
            }
          } catch { /* Ignore malformed liveness records. */ }
        }
        if (!pinnedAgentId) agents.sort((a, b) => a.active_allocations / a.capacity - b.active_allocations / b.capacity);

        for (const candidate of agents) {
          const result = await this.withRelayAgentLock(candidate.agent_id, async () => {
            const key = `multiplayer:relay:agent:${candidate.agent_id}`;
            const raw = await this.redis.get(key);
            if (!raw) return null;
            let agent: RelayAgentRecord;
            try { agent = JSON.parse(raw) as RelayAgentRecord; } catch { return null; }
            if (agent.agent_id !== candidate.agent_id || !isMultiplayerV1Endpoint(agent.endpoint)
              || !Number.isSafeInteger(agent.capacity) || agent.capacity < 1) return null;
            const activeCount = await this.relayAllocations.count({
              where: { agent_id: agent.agent_id, status: In(['active', 'connected']), expires_at: MoreThan(new Date()) },
            });
            if (activeCount >= agent.capacity) return null;

            const allocationId = opaqueId('rly');
            const expiresAt = new Date(Date.now() + RELAY_CREDENTIAL_TTL_SECONDS * 1000);
            await this.relayAllocations.save(this.relayAllocations.create({
              id: allocationId, session_id: session.id, peer_id: peer.id, agent_id: agent.agent_id,
              status: 'active', connection_id: null, connected_at: null, pending_expires_at: null, expires_at: expiresAt,
            }));
            agent.active_allocations = activeCount + 1;
            await this.redis.set(key, JSON.stringify(agent), 45).catch(() => null);
            return { agent, allocationId, expiresAt };
          });
          if (result) return result;
        }
        return null;
      });
    });
    if (!reservation) fail(503, 'RELAY_UNAVAILABLE');
    const { agent, allocationId, expiresAt } = reservation;
    const credential = signRelayCredential(secret, {
      id: allocationId, session_id: session.id, peer_id: peer.id, agent_id: agent.agent_id,
    }, expiresAt);
    await this.realtime.emitSession(session.id, 'relay.allocated', { session_id: session.id, peer_id: peer.id, allocation_id: allocationId, agent_id: agent.agent_id });
    return { allocation_id: allocationId, agent_id: agent.agent_id, endpoint: agent.endpoint, credential, expires_in: RELAY_CREDENTIAL_TTL_SECONDS };
  }

  async registerRelayAgent(agent: RelayAgentRegisterDto) {
    this.assertRelayAgentAllowed(agent.agent_id);
    let endpoint: URL;
    try { endpoint = new URL(agent.endpoint); } catch { fail(400, 'CANDIDATE_INVALID'); }
    const port = explicitRelayPort(agent.endpoint);
    if (!['wss:', 'udp:', 'quic:', 'tcp:'].includes(endpoint.protocol)
      || !endpoint.hostname || port === null
      || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) fail(400, 'CANDIDATE_INVALID');
    if (endpoint.protocol === 'wss:' && endpoint.pathname !== '/relay/v1') fail(400, 'CANDIDATE_INVALID');
    const record = await this.withRelayAgentLock(agent.agent_id, async () => {
      const active_allocations = await this.relayAllocations.count({ where: {
        agent_id: agent.agent_id, status: In(['active', 'connected']), expires_at: MoreThan(new Date()),
      } });
      const value: RelayAgentRecord = {
        agent_id: agent.agent_id, endpoint: agent.endpoint, region: agent.region || null, capacity: agent.capacity,
        active_allocations, capabilities: agent.capabilities || {}, last_heartbeat_at: Date.now(),
      };
      await this.redis.set(`multiplayer:relay:agent:${agent.agent_id}`, JSON.stringify(value), 45);
      return value;
    });
    if (!record) fail(503, 'RELAY_UNAVAILABLE');
    return { agent_id: agent.agent_id, registered: true, expires_in: 45 };
  }

  async heartbeatRelayAgent(agentId: string) {
    this.assertRelayAgentAllowed(agentId);
    const key = `multiplayer:relay:agent:${agentId}`;
    const record = await this.withRelayAgentLock(agentId, async () => {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      let value: RelayAgentRecord;
      try { value = JSON.parse(raw) as RelayAgentRecord; } catch { return null; }
      value.active_allocations = await this.relayAllocations.count({ where: {
        agent_id: agentId, status: In(['active', 'connected']), expires_at: MoreThan(new Date()),
      } });
      value.last_heartbeat_at = Date.now();
      await this.redis.set(key, JSON.stringify(value), 45);
      return value;
    });
    if (!record) fail(404, 'RELAY_UNAVAILABLE');
    return { agent_id: agentId, accepted: true, expires_in: 45 };
  }

  async consumeRelayCredential(agentId: string, input: RelayAllocationAckDto) {
    this.assertRelayAgentAllowed(agentId);
    const secret = this.config.get<string>('multiplayer.relayCredentialSecret') || '';
    if (secret.length < 32) fail(503, 'RELAY_UNAVAILABLE');
    const claims = verifyRelayCredential(input.credential, secret);
    if (!claims || claims.relay_session_id !== input.allocation_id || claims.agent_id !== agentId) {
      fail(403, 'SESSION_PERMISSION_DENIED');
    }

    const allocation = await this.relayAllocations.findOneBy({ id: input.allocation_id, agent_id: agentId });
    if (!allocation || allocation.status === 'revoked' || allocation.status === 'expired'
      || allocation.expires_at.getTime() <= Date.now()) fail(503, 'RELAY_UNAVAILABLE');
    if (claims.session_id !== allocation.session_id || claims.peer_id !== allocation.peer_id) {
      fail(403, 'SESSION_PERMISSION_DENIED');
    }

    const peer = await this.peers.findOneBy({ id: allocation.peer_id, session_id: allocation.session_id });
    if (!peer || peer.status !== 'active') fail(404, 'PEER_EXPIRED');

    if (allocation.status === 'connected') {
      if (allocation.connection_id !== input.connection_id) fail(429, 'RELAY_LIMIT_REACHED');
      const now = new Date();
      const pendingExpiry = allocation.pending_expires_at;
      if (pendingExpiry && claims.expiry === Math.floor(pendingExpiry.getTime() / 1000)
        && pendingExpiry.getTime() > now.getTime()) {
        const changed = await this.relayAllocations.update({
          id: allocation.id, agent_id: agentId, status: 'connected', connection_id: input.connection_id,
          pending_expires_at: pendingExpiry, expires_at: MoreThan(now),
        }, { expires_at: pendingExpiry, pending_expires_at: null });
        if (!changed.affected) {
          const current = await this.relayAllocations.findOneBy({ id: allocation.id, agent_id: agentId });
          if (current?.status === 'connected' && current.connection_id === input.connection_id
            && !current.pending_expires_at && Math.floor(current.expires_at.getTime() / 1000) === claims.expiry
            && current.expires_at.getTime() > Date.now()) {
            return this.relayConnectionAck(current, peer.role, input.connection_id);
          }
          fail(403, 'SESSION_PERMISSION_DENIED');
        }
        const renewed = await this.relayAllocations.findOneBy({ id: allocation.id, agent_id: agentId });
        if (!renewed || renewed.status !== 'connected' || renewed.connection_id !== input.connection_id
          || renewed.expires_at.getTime() <= Date.now()) fail(503, 'RELAY_UNAVAILABLE');
        return this.relayConnectionAck(renewed, peer.role, input.connection_id);
      }
      if (claims.expiry !== Math.floor(allocation.expires_at.getTime() / 1000)) {
        fail(403, 'SESSION_PERMISSION_DENIED');
      }
      return this.relayConnectionAck(allocation, peer.role, input.connection_id);
    }
    if (claims.expiry !== Math.floor(allocation.expires_at.getTime() / 1000)) fail(403, 'SESSION_PERMISSION_DENIED');
    if (allocation.connection_id) fail(503, 'RELAY_UNAVAILABLE');

    const connectedAt = new Date();
    const changed = await this.relayAllocations.update({
      id: allocation.id, agent_id: agentId, status: 'active', connection_id: IsNull(), expires_at: MoreThan(connectedAt),
    }, { status: 'connected', connection_id: input.connection_id, connected_at: connectedAt });
    if (!changed.affected) {
      const current = await this.relayAllocations.findOneBy({ id: allocation.id, agent_id: agentId });
      if (!current || current.status !== 'connected' || current.connection_id !== input.connection_id
        || current.expires_at.getTime() <= Date.now()) {
        fail(429, 'RELAY_LIMIT_REACHED');
      }
      return this.relayConnectionAck(current, peer.role, input.connection_id);
    }

    const connected = await this.relayAllocations.findOneBy({ id: allocation.id, agent_id: agentId });
    if (!connected || connected.status !== 'connected' || connected.connection_id !== input.connection_id
      || connected.expires_at.getTime() <= Date.now()) {
      fail(503, 'RELAY_UNAVAILABLE');
    }
    return this.relayConnectionAck(connected, peer.role, input.connection_id);
  }

  async revokeRelayAllocation(agentId: string, allocationId: string, connectionId?: string) {
    this.assertRelayAgentAllowed(agentId);
    const allocation = await this.relayAllocations.findOneBy({ id: allocationId, agent_id: agentId });
    if (!allocation) fail(404, 'RELAY_UNAVAILABLE');
    if (allocation.connection_id && allocation.connection_id !== connectionId) {
      fail(403, 'SESSION_PERMISSION_DENIED');
    }
    if (allocation.status === 'revoked') return { allocation_id: allocation.id, revoked: true };
    if (allocation.status === 'expired') return { allocation_id: allocation.id, revoked: false, status: 'expired' };
    if (!(await this.transitionRelayAllocation(allocation, 'revoked'))) {
      const current = await this.relayAllocations.findOneBy({ id: allocation.id, agent_id: agentId });
      if (current?.status === 'revoked' && current.connection_id === allocation.connection_id) {
        return { allocation_id: current.id, revoked: true };
      }
      fail(404, 'RELAY_UNAVAILABLE');
    }
    await this.realtime.emitSession(allocation.session_id, 'relay.revoked', { session_id: allocation.session_id, peer_id: allocation.peer_id, allocation_id: allocation.id });
    return { allocation_id: allocation.id, revoked: true };
  }

  private relayConnectionAck(allocation: MultiplayerRelayAllocation, peerRole: string, connectionId: string) {
    return {
      allocation_id: allocation.id,
      agent_id: allocation.agent_id,
      session_id: allocation.session_id,
      peer_id: allocation.peer_id,
      peer_role: peerRole,
      connection_id: connectionId,
      expires_at: allocation.expires_at,
    };
  }

  async canViewSession(viewerId: number, session: MultiplayerSession): Promise<boolean> {
    return this.sessionPolicy.canViewSession(viewerId, session);
  }

  async authorizeRealtimeSession(userId: number, sessionId: string): Promise<void> {
    await this.findActiveSession(sessionId);
    await this.requireActivePeer(userId, sessionId);
  }

  private async assertCanJoin(userId: number, session: MultiplayerSession, viaInviteOrApproval: boolean, viaJoinCode = false): Promise<void> {
    const denial = await this.sessionPolicy.joinDenialCode(userId, session, {
      viaInviteOrApproval,
      viaJoinCode,
    });
    if (denial) this.failPolicy(denial);
  }

  private failPolicy(code: string): never {
    if (code === 'SESSION_FULL' || code === 'JOIN_REQUEST_REQUIRED') fail(409, code);
    if (code === 'SESSION_NOT_JOINABLE') fail(400, code);
    if (code === 'INVITE_NOT_FOUND') fail(404, code);
    fail(403, code);
  }

  private async getUsableInvite(inviteId: string, sessionId: string | undefined, userId: number): Promise<MultiplayerInvite> {
    const invite = await this.invites.findOne({ where: { id: inviteId, target_user_id: userId, status: 'pending' } });
    if (!invite || (sessionId && invite.session_id !== sessionId)) fail(404, 'INVITE_NOT_FOUND');
    if (invite.expires_at.getTime() <= Date.now()) { invite.status = 'expired'; await this.invites.save(invite); fail(410, 'INVITE_EXPIRED'); }
    return invite;
  }

  private async findActiveSession(sessionId: string): Promise<MultiplayerSession> {
    if (!/^ses_[A-Za-z0-9_-]{16,32}$/.test(sessionId)) fail(404, 'SESSION_NOT_FOUND');
    const session = await this.sessions.findOneBy({ id: sessionId });
    if (!session) fail(404, 'SESSION_NOT_FOUND');
    await this.assertSessionActive(session);
    return session;
  }

  private async findResumableSession(sessionId: string): Promise<MultiplayerSession> {
    if (!/^ses_[A-Za-z0-9_-]{16,32}$/.test(sessionId)) fail(404, 'SESSION_NOT_FOUND');
    const session = await this.sessions.findOneBy({ id: sessionId });
    if (!session) fail(404, 'SESSION_NOT_FOUND');
    if (session.expires_at.getTime() <= Date.now()) { await this.closeSession(session, 'session.closed'); fail(404, 'SESSION_EXPIRED'); }
    if (session.status === 'closing' && (!session.close_after || session.close_after.getTime() > Date.now())) return session;
    if (session.status !== 'active') fail(404, 'SESSION_CLOSED');
    return session;
  }

  private async assertSessionActive(session: MultiplayerSession): Promise<void> {
    if (session.expires_at.getTime() <= Date.now()) {
      await this.closeSession(session, 'session.expired');
      fail(404, 'SESSION_EXPIRED');
    }
    if (session.status === 'closing' && session.close_after && session.close_after.getTime() <= Date.now()) {
      await this.closeSession(session, 'session.closed');
      fail(404, 'SESSION_CLOSED');
    }
    if (session.status !== 'active') fail(404, 'SESSION_CLOSED');
  }

  private async requireActivePeer(userId: number, sessionId: string): Promise<MultiplayerPeer> {
    const peer = await this.peers.findOne({ where: { session_id: sessionId, user_id: userId, status: 'active' } });
    if (!peer) fail(403, 'SESSION_PERMISSION_DENIED');
    return peer;
  }

  private async activePeer(sessionId: string, userId: number): Promise<MultiplayerPeer | null> {
    return this.peers.findOne({ where: { session_id: sessionId, user_id: userId, status: 'active' } });
  }

  private async requirePeer(userId: number, sessionId: string, peerId: string): Promise<MultiplayerPeer> {
    const peer = await this.peers.findOneBy({ id: peerId, session_id: sessionId, user_id: userId });
    if (!peer) fail(404, 'PEER_NOT_FOUND');
    return peer;
  }

  private async closeSession(session: MultiplayerSession, event = 'session.closed'): Promise<void> {
    if (session.status === 'closed') return;
    session.status = 'closed';
    session.close_after = null;
    await this.sessions.save(session);
    const occupyingPeers = await this.peers.find({ where: { session_id: session.id, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } });
    for (const peer of occupyingPeers) {
      const expired = await this.peers.update({
        id: peer.id, session_id: session.id, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES),
      }, { status: 'expired' });
      if (!expired.affected) continue;
      await this.redis.del(`multiplayer:peer:${peer.id}`);
      await this.clearCandidates(session.id, peer.id);
    }
    const allocations = await this.relayAllocations.find({ where: { session_id: session.id, status: In(['active', 'connected']) } });
    for (const allocation of allocations) {
      if (await this.transitionRelayAllocation(allocation, 'revoked')) {
        await this.realtime.emitSession(session.id, 'relay.revoked', {
          session_id: session.id, peer_id: allocation.peer_id, allocation_id: allocation.id,
        });
      }
    }
    await this.redis.del(`multiplayer:session:${session.id}`);
    await this.realtime.emitSession(session.id, event, { session_id: session.id, status: 'closed' });
  }

  private async cleanupExpiredSessions(): Promise<void> {
    try {
      await this.cleanupPeerLifecycles(new Date());
    } catch (error) {
      this.logger.warn(`Multiplayer peer expiry sweep failed: ${(error as Error).message}`);
    }
    try {
      const now = new Date();
      const rows = await this.sessions.createQueryBuilder('session')
        .where("session.status = 'closing' AND session.close_after <= :now", { now })
        .orWhere("session.status = 'active' AND session.expires_at <= :now", { now })
        .take(50).getMany();
      for (const session of rows) await this.closeSession(session, session.expires_at <= now ? 'session.closed' : 'session.closed');
    } catch (error) {
      this.logger.warn(`Multiplayer expiry sweep failed: ${(error as Error).message}`);
    }
    try {
      await this.invites.createQueryBuilder().update().set({ status: 'expired' })
        .where("status = 'pending' AND expires_at <= :now", { now: new Date() }).execute();
      await this.joinRequests.createQueryBuilder().update().set({ status: 'expired' })
        .where("status = 'pending' AND expires_at <= :now", { now: new Date() }).execute();
      await this.joinIntents.createQueryBuilder().delete()
        .where('invite_id IS NULL')
        .andWhere('((consumed_at IS NULL AND expires_at <= :now) OR (consumed_at IS NOT NULL AND recovery_expires_at <= :now))', { now: new Date() })
        .execute();
      const expiredAllocations = await this.relayAllocations.find({ where: {
        status: In(['active', 'connected']), expires_at: LessThanOrEqual(new Date()),
      } });
      for (const allocation of expiredAllocations) await this.transitionRelayAllocation(allocation, 'expired');
    } catch (error) {
      this.logger.warn(`Multiplayer TTL sweep failed: ${(error as Error).message}`);
    }
  }

  private async cleanupPeerLifecycles(now: Date): Promise<void> {
    const staleBefore = new Date(now.getTime() - PRESENCE_TTL_SECONDS * 1000);
    const stalePeers = await this.peers.find({
      where: [
        { status: 'active', last_seen_at: LessThanOrEqual(staleBefore) },
        { status: 'active', last_seen_at: IsNull() },
      ],
      order: { last_seen_at: 'ASC' },
      take: 100,
    });

    for (const peer of stalePeers) {
      await this.withRelayLock(`multiplayer:relay:peer-lock:${peer.id}`, async () => {
        const currentPeer = await this.peers.findOneBy({ id: peer.id });
        if (!currentPeer || currentPeer.status !== 'active'
          || (currentPeer.last_seen_at && currentPeer.last_seen_at.getTime() > staleBefore.getTime())) return false;
        const leaseStart = currentPeer.last_seen_at || staleBefore;
        const disconnected = await this.peers.createQueryBuilder().update(MultiplayerPeer)
          .set({ status: 'disconnected', last_seen_at: leaseStart })
          .where('id = :id AND status = :active', { id: currentPeer.id, active: 'active' })
          .andWhere('(last_seen_at IS NULL OR last_seen_at <= :staleBefore)', { staleBefore })
          .execute();
        if (!disconnected.affected) return false;
        currentPeer.status = 'disconnected';
        currentPeer.last_seen_at = leaseStart;
        if (currentPeer.role === 'owner') {
          try {
            await this.ensureStaleOwnerSessionClosing(currentPeer, now);
          } catch (error) {
            this.logger.warn(`Could not close stale owner Session ${currentPeer.session_id}: ${(error as Error).message}`);
          }
        }
        try {
          await this.realtime.emitSession(currentPeer.session_id, 'peer.disconnected', {
            session_id: currentPeer.session_id, peer_id: currentPeer.id,
          });
        } catch (error) {
          this.logger.warn(`Could not emit stale Peer disconnect for ${currentPeer.id}: ${(error as Error).message}`);
        }
        return true;
      }).catch((error) => {
        this.logger.warn(`Could not disconnect stale Peer ${peer.id}: ${(error as Error).message}`);
        return null;
      });
    }

    const disconnectedPeers = await this.peers.find({
      where: { status: 'disconnected' }, order: { last_seen_at: 'ASC' }, take: 100,
    });
    const expiredBefore = new Date(now.getTime() - (PRESENCE_TTL_SECONDS + PEER_DISCONNECT_GRACE_SECONDS) * 1000);
    for (const peer of disconnectedPeers) {
      try {
        await this.withRelayLock(`multiplayer:relay:peer-lock:${peer.id}`, async () => {
          const currentPeer = await this.peers.findOneBy({ id: peer.id });
          if (!currentPeer || currentPeer.status !== 'disconnected') return false;
          if (!currentPeer.last_seen_at) {
            const leaseStart = new Date(now.getTime() - PRESENCE_TTL_SECONDS * 1000);
            const initialized = await this.peers.update(
              { id: currentPeer.id, status: 'disconnected', last_seen_at: IsNull() },
              { last_seen_at: leaseStart },
            );
            if (!initialized.affected) return false;
            currentPeer.last_seen_at = leaseStart;
          }
          await this.cleanupDisconnectedPeerResources(currentPeer);
          if (currentPeer.role === 'owner') await this.ensureStaleOwnerSessionClosing(currentPeer, now);
          if (currentPeer.last_seen_at!.getTime() > expiredBefore.getTime()) return true;
          const pendingApprovalRecovery = await this.joinRequests.findOneBy({
            consumed_peer_id: currentPeer.id,
            realtime_acknowledged_at: IsNull(),
            recovery_expires_at: MoreThan(now),
          });
          if (pendingApprovalRecovery) return true;
          const pendingJoinIntentRecovery = await this.joinIntents.findOneBy({
            consumed_peer_id: currentPeer.id,
            recovery_expires_at: MoreThan(now),
          });
          if (pendingJoinIntentRecovery) return true;
          const expired = await this.peers.createQueryBuilder().update(MultiplayerPeer)
            .set({ status: 'expired' })
            .where('id = :id AND session_id = :sessionId AND status = :disconnected', {
              id: currentPeer.id, sessionId: currentPeer.session_id, disconnected: 'disconnected',
            })
            .andWhere('last_seen_at <= :expiredBefore', { expiredBefore })
            .execute();
          if (!expired.affected) return false;
          await this.realtime.emitSession(currentPeer.session_id, 'peer.updated', {
            session_id: currentPeer.session_id, peer_id: currentPeer.id, status: 'expired',
          });
          return true;
        });
      } catch (error) {
        this.logger.warn(`Could not clean disconnected Peer ${peer.id}: ${(error as Error).message}`);
      }
    }
  }

  private async ensureStaleOwnerSessionClosing(peer: MultiplayerPeer, now: Date): Promise<void> {
    const closeAfter = peer.last_seen_at
      ? new Date(peer.last_seen_at.getTime() + (PRESENCE_TTL_SECONDS * 1000) + OWNER_GRACE_MS)
      : new Date(now.getTime() + OWNER_GRACE_MS);
    const updated = await this.sessions.update(
      { id: peer.session_id, status: 'active' },
      { status: 'closing', close_after: closeAfter },
    );
    if (updated.affected) {
      try {
        await this.realtime.emitSession(peer.session_id, 'session.updated', {
          session_id: peer.session_id, status: 'closing', grace_seconds: OWNER_GRACE_MS / 1000,
        });
      } catch (error) {
        this.logger.warn(`Could not emit stale owner Session closing for ${peer.session_id}: ${(error as Error).message}`);
      }
    }
  }

  private async cleanupDisconnectedPeerResources(peer: MultiplayerPeer): Promise<void> {
    const markerKey = `multiplayer:peer-cleanup:${peer.id}`;
    if (await this.redis.get(markerKey)) return;
    await this.redis.del(`multiplayer:peer:${peer.id}`);
    await this.clearCandidates(peer.session_id, peer.id);
    await this.revokeRelayAllocationsForPeer(peer.id);
    await this.redis.set(markerKey, 'done', PRESENCE_TTL_SECONDS + PEER_DISCONNECT_GRACE_SECONDS);
  }

  private async clearCandidates(sessionId: string, peerId: string): Promise<void> {
    await this.redis.del(`multiplayer:candidates:${sessionId}:${peerId}`);
  }

  private async withRelayAgentLock<T>(agentId: string, action: () => Promise<T>): Promise<T | null> {
    return this.withRelayLock(`multiplayer:relay:agent-lock:${agentId}`, action);
  }

  private assertRelayAgentAllowed(agentId: string): void {
    const allowList = (this.config.get<string>('multiplayer.relayAgentIds') || '').split(',').map((value) => value.trim()).filter(Boolean);
    if (!allowList.includes(agentId)) fail(403, 'SESSION_PERMISSION_DENIED');
  }

  private async withRelayLock<T>(key: string, action: () => Promise<T>): Promise<T | null> {
    const token = randomBytes(24).toString('base64url');
    if (!(await this.redis.setIfNotExists(key, token, 30))) return null;
    try { return await action(); }
    finally { await this.redis.getAndDeleteIfMatches(key, token).catch(() => null); }
  }

  private async transitionRelayAllocation(allocation: MultiplayerRelayAllocation, status: 'revoked' | 'expired'): Promise<boolean> {
    const changed = await this.withRelayAgentLock(allocation.agent_id, async () => {
      const result = await this.relayAllocations.update(
        { id: allocation.id, agent_id: allocation.agent_id, status: In(['active', 'connected']) }, { status },
      );
      if (!result.affected) return false;
      const key = `multiplayer:relay:agent:${allocation.agent_id}`;
      const raw = await this.redis.get(key);
      if (raw) {
        try {
          const record = JSON.parse(raw) as RelayAgentRecord;
          record.active_allocations = await this.relayAllocations.count({ where: {
            agent_id: allocation.agent_id, status: In(['active', 'connected']), expires_at: MoreThan(new Date()),
          } });
          await this.redis.set(key, JSON.stringify(record), 45);
        } catch { /* Agent metadata will be reconstructed on its next heartbeat. */ }
      }
      return true;
    });
    return changed === true;
  }

  private async revokeRelayAllocationsForPeer(peerId: string): Promise<void> {
    const allocations = await this.relayAllocations.find({ where: { peer_id: peerId, status: In(['active', 'connected']) } });
    for (const allocation of allocations) {
      if (await this.transitionRelayAllocation(allocation, 'revoked')) {
        await this.realtime.emitSession(allocation.session_id, 'relay.revoked', {
          session_id: allocation.session_id, peer_id: allocation.peer_id, allocation_id: allocation.id,
        });
      }
    }
  }

  private async requireEnabled(key: string): Promise<void> {
    if (!(await this.enabled(key))) fail(403, 'FEATURE_DISABLED');
  }

  private enabled(key: string): Promise<boolean> {
    return this.settings.getBoolean(`feature_${key}_enabled`, false);
  }

  private toPublicSession(session: MultiplayerSession, currentPlayers: number) {
    return {
      id: session.id, owner_user_id: session.owner_user_id, visibility: session.visibility,
      join_policy: session.join_policy, game: { id: session.game_id, version: session.game_version },
      activity_name: session.activity_name, current_players: currentPlayers, max_players: session.max_players,
      status: session.status, expires_at: session.expires_at,
    };
  }

  private toPublicPeer(peer: MultiplayerPeer) {
    return {
      peer_id: peer.id, user_id: peer.user_id, client_id: peer.client_id, role: peer.role,
      status: peer.status, capabilities: peer.capabilities, joined_at: peer.joined_at, last_seen_at: peer.last_seen_at,
    };
  }

  private async toPublicInvite(invite: MultiplayerInvite, session: MultiplayerSession | null) {
    return {
      invite_id: invite.id, session_id: invite.session_id, sender_user_id: invite.sender_user_id,
      target_user_id: invite.target_user_id, status: invite.status, expires_at: invite.expires_at,
      session: session ? this.toPublicSession(session, await this.peers.count({ where: { session_id: session.id, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } })) : null,
    };
  }

  private async auditEvent(actorUserId: number, action: string, targetType: string, targetId: string, details: Record<string, unknown>) {
    await this.audit.save(this.audit.create({ actor_user_id: actorUserId, action, target_type: targetType, target_id: targetId, details }));
  }
}

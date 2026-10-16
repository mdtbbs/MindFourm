import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { MultiplayerInvite } from '../../entities/multiplayer-invite.entity';
import { MultiplayerJoinRequest } from '../../entities/multiplayer-join-request.entity';
import { MultiplayerPeer } from '../../entities/multiplayer-peer.entity';
import {
  MultiplayerSession, MultiplayerSessionJoinPolicy, MultiplayerSessionVisibility,
} from '../../entities/multiplayer-session.entity';
import { SocialPolicyService } from '../social/social-policy.service';
import { MULTIPLAYER_CAPACITY_PEER_STATUSES } from './multiplayer.constants';

export interface JoinPolicyOptions {
  /** The caller already holds an accepted invite or an approved join request. */
  viaInviteOrApproval: boolean;
  /**
   * The caller presented the Session room code. A room code only locates the
   * Session and satisfies the owner's own `allow_join` privacy setting (the
   * owner issued that channel); it never satisfies `join_policy`.
   */
  viaJoinCode?: boolean;
}

/**
 * Everything the join ladder needs, already resolved. Keeping the decision
 * synchronous is what lets the single-Session join path and the batched lobby /
 * friend-card paths share one implementation instead of drifting apart.
 */
export interface JoinContext {
  joinPolicy: MultiplayerSessionJoinPolicy;
  requireApproval: boolean;
  blocked: boolean;
  friend: boolean;
  ownerAllowsJoin: boolean;
  ownerAllowsRequest: boolean;
  approvedPath: boolean;
  viaJoinCode: boolean;
  spaceAvailable: boolean;
}

export interface JoinDecision {
  /** Null when the user may join right now. */
  denial: string | null;
  can_join: boolean;
  can_request_join: boolean;
}

/**
 * The single join authorization ladder. `visibility` is deliberately absent:
 * discovery scope must never grant or deny join eligibility.
 */
export function evaluateJoin(ctx: JoinContext): JoinDecision {
  const deny = (code: string): JoinDecision => ({ denial: code, can_join: false, can_request_join: false });

  if (ctx.blocked) return deny('USER_BLOCKED');

  // `allow_join` is the owner's personal default for unsolicited joins, so it
  // applies only to the direct path. Three things clear it: an accepted invite /
  // approved request, the owner-issued room code, or the room itself declaring
  // `join_policy = public` — an explicit room setting outranks the personal
  // default, which is what makes `private + public` ("hidden, but anyone who has
  // the entry may join") meaningful instead of unreachable.
  const privacyCleared = ctx.approvedPath || ctx.viaJoinCode || ctx.ownerAllowsJoin
    || ctx.joinPolicy === 'public';
  if (!privacyCleared) return deny('PRIVACY_DENIED');

  if (ctx.joinPolicy === 'invite_only' && !ctx.approvedPath) {
    return { denial: 'SESSION_NOT_JOINABLE', can_join: false, can_request_join: false };
  }
  if (ctx.joinPolicy === 'friends' && !ctx.friend && !ctx.approvedPath) {
    return { denial: 'FRIEND_REQUIRED', can_join: false, can_request_join: false };
  }

  if (!ctx.spaceAvailable) return deny('SESSION_FULL');

  const requestable = ctx.requireApproval && requestPathOpen(ctx);
  if (ctx.requireApproval && !ctx.approvedPath) {
    return { denial: 'JOIN_REQUEST_REQUIRED', can_join: false, can_request_join: requestable };
  }
  return { denial: null, can_join: true, can_request_join: false };
}

/** Whether the Join Request flow itself is open to this user (ignoring approval state). */
export function evaluateJoinRequest(ctx: JoinContext): JoinDecision {
  const deny = (code: string): JoinDecision => ({ denial: code, can_join: false, can_request_join: false });
  if (!ctx.requireApproval) return deny('SESSION_NOT_JOINABLE');
  if (ctx.blocked) return deny('USER_BLOCKED');
  if (ctx.joinPolicy === 'invite_only') return deny('SESSION_NOT_JOINABLE');
  if (ctx.joinPolicy === 'friends' && !ctx.friend && !ctx.approvedPath) return deny('FRIEND_REQUIRED');
  if (!ctx.ownerAllowsRequest) return deny('PRIVACY_DENIED');
  if (!ctx.spaceAvailable) return deny('SESSION_FULL');
  return { denial: null, can_join: false, can_request_join: true };
}

function requestPathOpen(ctx: JoinContext): boolean {
  return ctx.ownerAllowsRequest && ctx.spaceAvailable && ctx.joinPolicy !== 'invite_only'
    && (ctx.joinPolicy !== 'friends' || ctx.friend || ctx.approvedPath);
}

/**
 * `visibility` answers "who can find this Session". Peers always see it, the
 * owner always sees it, and a blocked user never does.
 */
export function canDiscover(viewerId: number, session: {
  owner_user_id: number;
  visibility: MultiplayerSessionVisibility;
}, flags: { blocked: boolean; friend: boolean; activePeer: boolean }): boolean {
  if (flags.blocked) return false;
  if (viewerId === session.owner_user_id || flags.activePeer) return true;
  if (session.visibility === 'public') return true;
  if (session.visibility === 'friends') return flags.friend;
  return false;
}

@Injectable()
export class SessionPolicyService {
  constructor(
    private readonly social: SocialPolicyService,
    @InjectRepository(MultiplayerPeer) private readonly peers: Repository<MultiplayerPeer>,
    @InjectRepository(MultiplayerInvite) private readonly invites: Repository<MultiplayerInvite>,
    @InjectRepository(MultiplayerJoinRequest) private readonly joinRequests: Repository<MultiplayerJoinRequest>,
  ) {}

  async joinDenialCode(userId: number, session: MultiplayerSession, options: JoinPolicyOptions): Promise<string | null> {
    return (await this.decideJoin(userId, session, options)).denial;
  }

  async decideJoin(userId: number, session: MultiplayerSession, options: JoinPolicyOptions): Promise<JoinDecision> {
    const now = new Date();
    const [blocked, friend, allowJoin, allowRequest, approvedPath, count] = await Promise.all([
      this.social.isBlockedEither(userId, session.owner_user_id),
      this.social.areFriends(userId, session.owner_user_id),
      this.social.canPerform(userId, session.owner_user_id, 'allow_join'),
      this.social.canPerform(userId, session.owner_user_id, 'allow_join_request'),
      options.viaInviteOrApproval ? Promise.resolve(true) : this.hasApprovedJoinPath(userId, session.id),
      this.peers.count({ where: { session_id: session.id, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } }),
    ]);
    return evaluateJoin({
      joinPolicy: session.join_policy,
      requireApproval: session.require_approval === true,
      blocked,
      friend,
      ownerAllowsJoin: allowJoin,
      ownerAllowsRequest: allowRequest,
      approvedPath,
      viaJoinCode: options.viaJoinCode === true,
      spaceAvailable: count < session.max_players,
    });
  }

  async joinRequestDenialCode(userId: number, session: MultiplayerSession): Promise<string | null> {
    const { denial } = await this.decideJoinRequest(userId, session);
    return denial;
  }

  async decideJoinRequest(userId: number, session: MultiplayerSession): Promise<JoinDecision> {
    if (userId === session.owner_user_id) return { denial: 'SESSION_NOT_JOINABLE', can_join: false, can_request_join: false };
    if (!session.require_approval) return { denial: 'SESSION_NOT_JOINABLE', can_join: false, can_request_join: false };
    const existing = await this.peers.findOne({ where: {
      session_id: session.id, user_id: userId, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES),
    } });
    if (existing) return { denial: 'SESSION_NOT_JOINABLE', can_join: false, can_request_join: false };
    const pending = await this.joinRequests.findOne({ where: {
      session_id: session.id, requester_user_id: userId, status: 'pending', expires_at: MoreThan(new Date()),
    } });
    // An already-pending request may be retried without a second capacity check.
    if (pending) return { denial: null, can_join: false, can_request_join: true };

    const [blocked, friend, allowRequest, count] = await Promise.all([
      this.social.isBlockedEither(userId, session.owner_user_id),
      this.social.areFriends(userId, session.owner_user_id),
      this.social.canPerform(userId, session.owner_user_id, 'allow_join_request'),
      this.peers.count({ where: { session_id: session.id, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } }),
    ]);
    return evaluateJoinRequest({
      joinPolicy: session.join_policy,
      requireApproval: true,
      blocked,
      friend,
      ownerAllowsJoin: false,
      ownerAllowsRequest: allowRequest,
      approvedPath: false,
      viaJoinCode: false,
      spaceAvailable: count < session.max_players,
    });
  }

  async canViewSession(viewerId: number, session: MultiplayerSession): Promise<boolean> {
    const [blocked, friendship] = await Promise.all([
      this.social.isBlockedEither(viewerId, session.owner_user_id),
      this.social.areFriends(viewerId, session.owner_user_id),
    ]);
    if (blocked) return false;
    if (viewerId === session.owner_user_id) return true;
    const activePeer = await this.peers.findOne({ where: { session_id: session.id, user_id: viewerId, status: 'active' } });
    return canDiscover(viewerId, session, { blocked, friend: friendship, activePeer: !!activePeer });
  }

  async capacityReached(sessionId: string, maxPlayers: number): Promise<boolean> {
    return (await this.peers.count({ where: { session_id: sessionId, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } })) >= maxPlayers;
  }

  private async hasApprovedJoinPath(userId: number, sessionId: string): Promise<boolean> {
    const now = new Date();
    const [invite, request] = await Promise.all([
      this.invites.findOne({ where: { session_id: sessionId, target_user_id: userId, status: 'accepted', expires_at: MoreThan(now) } }),
      this.joinRequests.findOne({ where: { session_id: sessionId, requester_user_id: userId, status: 'approved', expires_at: MoreThan(now) } }),
    ]);
    return !!(invite && invite.expires_at.getTime() > Date.now()) || !!(request && request.expires_at.getTime() > Date.now());
  }
}

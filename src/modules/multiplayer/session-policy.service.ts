import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { MultiplayerInvite } from '../../entities/multiplayer-invite.entity';
import { MultiplayerJoinRequest } from '../../entities/multiplayer-join-request.entity';
import { MultiplayerPeer } from '../../entities/multiplayer-peer.entity';
import { MultiplayerSession } from '../../entities/multiplayer-session.entity';
import { SocialPolicyService } from '../social/social-policy.service';

export interface JoinPolicyOptions {
  viaInviteOrApproval: boolean;
  viaJoinCode?: boolean;
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
    if (await this.social.isBlockedEither(userId, session.owner_user_id)) return 'USER_BLOCKED';
    const approvedPath = options.viaInviteOrApproval || await this.hasApprovedJoinPath(userId, session.id);
    if (!approvedPath && !options.viaJoinCode && !(await this.social.canPerform(userId, session.owner_user_id, 'allow_join'))) {
      return 'PRIVACY_DENIED';
    }
    const friend = await this.social.areFriends(userId, session.owner_user_id);
    if (session.visibility === 'friends' && !friend && !approvedPath) return 'SESSION_PERMISSION_DENIED';
    if (session.visibility === 'private' && !approvedPath) return 'SESSION_PERMISSION_DENIED';
    if (session.visibility === 'unlisted' && !approvedPath && !options.viaJoinCode) return 'SESSION_NOT_JOINABLE';
    if (session.join_policy === 'friends' && !friend && !approvedPath) return 'FRIEND_REQUIRED';
    if (session.join_policy === 'invite_only' && !approvedPath) return 'SESSION_NOT_JOINABLE';
    if (session.join_policy === 'request' && !options.viaInviteOrApproval && !approvedPath) return 'JOIN_REQUEST_REQUIRED';
    const count = await this.peers.count({ where: { session_id: session.id, status: In(['joining', 'active', 'disconnected']) } });
    if (count >= session.max_players) return 'SESSION_FULL';
    return null;
  }

  async canViewSession(viewerId: number, session: MultiplayerSession): Promise<boolean> {
    if (await this.social.isBlockedEither(viewerId, session.owner_user_id)) return false;
    const [activePeer, friendship] = await Promise.all([
      this.peers.findOne({ where: { session_id: session.id, user_id: viewerId, status: 'active' } }),
      this.social.areFriends(viewerId, session.owner_user_id),
    ]);
    if (activePeer) return true;
    if (session.visibility === 'private' || session.visibility === 'unlisted') return false;
    return friendship;
  }

  async joinRequestDenialCode(userId: number, session: MultiplayerSession): Promise<string | null> {
    if (session.join_policy !== 'request') return 'SESSION_NOT_JOINABLE';
    if (userId === session.owner_user_id) return 'SESSION_NOT_JOINABLE';
    if (await this.social.isBlockedEither(userId, session.owner_user_id)) return 'USER_BLOCKED';
    if (!(await this.social.canPerform(userId, session.owner_user_id, 'allow_join_request'))) return 'PRIVACY_DENIED';
    const existing = await this.peers.findOne({ where: {
      session_id: session.id, user_id: userId, status: In(['joining', 'active', 'disconnected']),
    } });
    if (existing) return 'SESSION_NOT_JOINABLE';
    const pendingRequest = await this.joinRequests.findOne({ where: {
      session_id: session.id, requester_user_id: userId, status: 'pending', expires_at: MoreThan(new Date()),
    } });
    if (pendingRequest) return null;
    if (await this.capacityReached(session.id, session.max_players)) return 'SESSION_FULL';
    return null;
  }

  async capacityReached(sessionId: string, maxPlayers: number): Promise<boolean> {
    return (await this.peers.count({ where: { session_id: sessionId, status: In(['joining', 'active', 'disconnected']) } })) >= maxPlayers;
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

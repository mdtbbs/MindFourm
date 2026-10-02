import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MultiplayerPeer } from '../../entities/multiplayer-peer.entity';
import { MultiplayerSession } from '../../entities/multiplayer-session.entity';
import { SocialPolicyService } from '../social/social-policy.service';
import { MULTIPLAYER_CAPACITY_PEER_STATUSES } from './multiplayer.constants';

@Injectable()
export class InvitePolicyService {
  constructor(
    private readonly social: SocialPolicyService,
    @InjectRepository(MultiplayerPeer) private readonly peers: Repository<MultiplayerPeer>,
  ) {}

  async denialCode(senderId: number, targetId: number, session: MultiplayerSession): Promise<string | null> {
    if (senderId === targetId) return 'INVITE_NOT_FOUND';
    if (await this.social.isBlockedEither(senderId, targetId)) return 'USER_BLOCKED';
    if (!(await this.social.canPerform(senderId, targetId, 'allow_invites'))) return 'PRIVACY_DENIED';
    const targetPeer = await this.peers.findOne({ where: {
      session_id: session.id, user_id: targetId, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES),
    } });
    if (targetPeer) return 'SESSION_NOT_JOINABLE';
    const occupyingCount = await this.peers.count({ where: { session_id: session.id, status: In(MULTIPLAYER_CAPACITY_PEER_STATUSES) } });
    if (occupyingCount >= session.max_players) return 'SESSION_FULL';
    return null;
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Friendship } from '../../entities/friendship.entity';
import { MultiplayerAuditLog } from '../../entities/multiplayer-audit-log.entity';
import { MultiplayerInvite } from '../../entities/multiplayer-invite.entity';
import { MultiplayerJoinIntent } from '../../entities/multiplayer-join-intent.entity';
import { MultiplayerJoinRequest } from '../../entities/multiplayer-join-request.entity';
import { MultiplayerPeer } from '../../entities/multiplayer-peer.entity';
import { MultiplayerPeerResumeToken } from '../../entities/multiplayer-peer-resume-token.entity';
import { MultiplayerRelayAllocation } from '../../entities/multiplayer-relay-allocation.entity';
import { MultiplayerSession } from '../../entities/multiplayer-session.entity';
import { MultiplayerSessionMod } from '../../entities/multiplayer-session-mod.entity';
import { Resource } from '../../entities/resource.entity';
import { ResourceVersion } from '../../entities/resource-version.entity';
import { ResourceFile } from '../../entities/resource-file.entity';
import { ResourcePackItem } from '../../entities/resource-pack-item.entity';
import { ModProfile, ModVersionMetadata } from '../../entities/mod-resource-v2.entity';
import { UserPresencePreference } from '../../entities/user-presence-preference.entity';
import { User } from '../../entities/user.entity';
import { DownloadsModule } from '../downloads/downloads.module';
import { FriendsModule } from '../friends/friends.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { SocialModule } from '../social/social.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MultiplayerService } from './multiplayer.service';
import { MultiplayerV1Controller, RelayInternalV1Controller } from './multiplayer-v1.controller';
import { RelayInternalAuthGuard } from './relay-internal-auth.guard';
import { ThirdPartyMultiplayerGuard } from './third-party-multiplayer.guard';
import { SessionPolicyService } from './session-policy.service';
import { InvitePolicyService } from './invite-policy.service';
import { MultiplayerModCatalogService } from './multiplayer-mod-catalog.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Friendship, MultiplayerSession, MultiplayerPeer, MultiplayerPeerResumeToken,
      MultiplayerInvite, MultiplayerJoinIntent, MultiplayerJoinRequest, MultiplayerRelayAllocation, MultiplayerAuditLog, User, UserPresencePreference,
      MultiplayerSessionMod, Resource, ResourceVersion, ResourceFile, ResourcePackItem, ModProfile, ModVersionMetadata,
    ]),
    DownloadsModule,
    FriendsModule,
    NotificationsModule,
    SettingsModule,
    SocialModule,
    RealtimeModule,
  ],
  controllers: [MultiplayerV1Controller, RelayInternalV1Controller],
  providers: [MultiplayerService, MultiplayerModCatalogService, RelayInternalAuthGuard, ThirdPartyMultiplayerGuard, SessionPolicyService, InvitePolicyService],
  exports: [MultiplayerService],
})
export class MultiplayerModule {}

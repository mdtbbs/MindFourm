import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Friendship } from '@entities/friendship.entity';
import { User } from '@entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ServiceApiModule } from '../service-api/service-api.module';
import { PresenceService } from './presence.service';
import { ExternalPresenceController } from './external-presence.controller';
import { ExternalNotificationsController } from './external-notifications.controller';
import { PresenceController } from './presence.controller';
import { StaffPresenceService } from './staff-presence.service';
import { PresenceConnectionsService } from './presence-connections.service';
import { PresenceV1Controller, SocialFriendsPresenceV1Controller } from './presence-v1.controller';
import { SocialModule } from '../social/social.module';
import { MultiplayerModule } from '../multiplayer/multiplayer.module';
import { UserPresencePreference } from '../../entities/user-presence-preference.entity';
import { SettingsModule } from '../settings/settings.module';
import { FriendsModule } from '../friends/friends.module';
import { PresencePolicyService } from './presence-policy.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Friendship, User, UserPresencePreference]),
    NotificationsModule,
    ServiceApiModule,
    SocialModule,
    FriendsModule,
    MultiplayerModule,
    SettingsModule,
  ],
  controllers: [PresenceController, ExternalPresenceController, ExternalNotificationsController, PresenceV1Controller, SocialFriendsPresenceV1Controller],
  providers: [PresenceService, StaffPresenceService, PresenceConnectionsService, PresencePolicyService],
  exports: [PresenceService, PresenceConnectionsService],
})
export class PresenceModule {}

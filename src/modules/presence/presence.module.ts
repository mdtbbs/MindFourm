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

@Module({
  imports: [
    TypeOrmModule.forFeature([Friendship, User]),
    NotificationsModule,
    ServiceApiModule,
  ],
  controllers: [PresenceController, ExternalPresenceController, ExternalNotificationsController],
  providers: [PresenceService, StaffPresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}

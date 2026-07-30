import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Friendship } from '@entities/friendship.entity';
import { User } from '@entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ServiceApiModule } from '../service-api/service-api.module';
import { PresenceService } from './presence.service';
import { ExternalPresenceController } from './external-presence.controller';
import { ExternalNotificationsController } from './external-notifications.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Friendship, User]),
    NotificationsModule,
    ServiceApiModule,
  ],
  controllers: [ExternalPresenceController, ExternalNotificationsController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}

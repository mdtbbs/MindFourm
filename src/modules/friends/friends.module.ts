import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Friendship } from '@entities/friendship.entity';
import { User } from '@entities/user.entity';
import { UserBlocksModule } from '../user-blocks/user-blocks.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ServiceApiModule } from '../service-api/service-api.module';
import { FriendsService } from './friends.service';
import { FriendsController } from './friends.controller';
import { ExternalFriendsController, ExternalUsersSearchController } from './external-friends.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Friendship, User]),
    UserBlocksModule,
    NotificationsModule,
    ServiceApiModule,
  ],
  controllers: [FriendsController, ExternalFriendsController, ExternalUsersSearchController],
  providers: [FriendsService],
  exports: [FriendsService],
})
export class FriendsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepliesService } from './replies.service';
import { RepliesController, RepliesControllerMain } from './replies.controller';
import { Reply } from '@entities/reply.entity';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PluginsModule } from '../plugins/plugins.module';
import { PointsModule } from '../points/points.module';
import { SettingsModule } from '../settings/settings.module';
import { LogsModule } from '../logs/logs.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reply, Post, User]),
    NotificationsModule,
    PluginsModule,
    PointsModule,
    SettingsModule,
    LogsModule,
    AdminNotificationsModule,
  ],
  providers: [RepliesService],
  controllers: [RepliesController, RepliesControllerMain],
  exports: [RepliesService],
})
export class RepliesModule {}

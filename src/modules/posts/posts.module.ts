import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { Post } from '@entities/post.entity';
import { User } from '@entities/user.entity';
import { Category } from '@entities/category.entity';
import { Tag } from '@entities/tag.entity';
import { PostTag } from '@entities/post-tag.entity';
import { Reply } from '@entities/reply.entity';
import { DatabaseModule } from '../../database/database.module';
import { PointsModule } from '../points/points.module';
import { GroupsModule } from '../groups/groups.module';
import { PluginsModule } from '../plugins/plugins.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { LogsModule } from '../logs/logs.module';

@Module({
  imports: [
    DatabaseModule,
    PointsModule,
    GroupsModule,
    PluginsModule,
    NotificationsModule,
    SettingsModule,
    LogsModule,
    TypeOrmModule.forFeature([Post, User, Category, Tag, PostTag, Reply]),
  ],
  providers: [PostsService],
  controllers: [PostsController],
  exports: [PostsService],
})
export class PostsModule {}

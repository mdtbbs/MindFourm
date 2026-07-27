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
import { PostRevision } from '@entities/post-revision.entity';
import { DatabaseModule } from '../../database/database.module';
import { PointsModule } from '../points/points.module';
import { GroupsModule } from '../groups/groups.module';
import { PluginsModule } from '../plugins/plugins.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { LogsModule } from '../logs/logs.module';
import { PostSummaryService } from './post-summary.service';
import { PostDetailService } from './post-detail.service';
import { PostRevisionsService } from './post-revisions.service';

@Module({
  imports: [
    DatabaseModule,
    PointsModule,
    GroupsModule,
    PluginsModule,
    NotificationsModule,
    AdminNotificationsModule,
    SettingsModule,
    LogsModule,
    TypeOrmModule.forFeature([Post, User, Category, Tag, PostTag, Reply, PostRevision]),
  ],
  providers: [PostsService, PostSummaryService, PostDetailService, PostRevisionsService],
  controllers: [PostsController],
  exports: [PostsService, PostSummaryService, PostDetailService, PostRevisionsService],
})
export class PostsModule {}

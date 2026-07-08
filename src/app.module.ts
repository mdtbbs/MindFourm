import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { appConfig } from './config/app.config';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './common/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { PostsModule } from './modules/posts/posts.module';
import { RepliesModule } from './modules/replies/replies.module';
import { UsersModule } from './modules/users/users.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TagsModule } from './modules/tags/tags.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminNotificationsModule } from './modules/admin-notifications/admin-notifications.module';
import { BookmarksModule } from './modules/bookmarks/bookmarks.module';
import { LikesModule } from './modules/likes/likes.module';
import { MessagesModule } from './modules/messages/messages.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { ServersModule } from './modules/servers/servers.module';
import { PostServersModule } from './modules/post-servers/post-servers.module';
import { AutoPostModule } from './modules/auto-post/auto-post.module';
import { AdminModule } from './modules/admin/admin.module';
import { BansModule } from './modules/bans/bans.module';
import { StatsModule } from './modules/stats/stats.module';
import { SettingsModule } from './modules/settings/settings.module';
import { LogsModule } from './modules/logs/logs.module';
import { PointsModule } from './modules/points/points.module';
import { LevelsModule } from './modules/levels/levels.module';
import { BadgesModule } from './modules/badges/badges.module';
import { FollowsModule } from './modules/follows/follows.module';
import { GroupsModule } from './modules/groups/groups.module';
import { ShopModule } from './modules/shop/shop.module';
import { RssModule } from './modules/rss/rss.module';
import { PluginsModule } from './modules/plugins/plugins.module';
import { SearchModule } from './modules/search/search.module';
import { ServiceApiModule } from './modules/service-api/service-api.module';
import { PhoneWriteGuard } from './common/guards/phone-write.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    DatabaseModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads', 'avatars'),
      serveRoot: '/uploads/avatars',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads', 'attachments'),
      serveRoot: '/uploads/attachments',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads', 'resources'),
      serveRoot: '/uploads/resources',
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/public',
    }),
    AuthModule,
    PostsModule,
    RepliesModule,
    UsersModule,
    CategoriesModule,
    TagsModule,
    NotificationsModule,
    AdminNotificationsModule,
    BookmarksModule,
    LikesModule,
    MessagesModule,
    AttachmentsModule,
    ResourcesModule,
    ServersModule,
    PostServersModule,
    AutoPostModule,
    AdminModule,
    BansModule,
    StatsModule,
    SettingsModule,
    LogsModule,
    PointsModule,
    LevelsModule,
    BadgesModule,
    FollowsModule,
    GroupsModule,
    ShopModule,
    RssModule,
    PluginsModule,
    SearchModule,
    ServiceApiModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: PhoneWriteGuard,
    },
  ],
})
export class AppModule {}

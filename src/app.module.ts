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
import { ReportsModule } from './modules/reports/reports.module';
import { UserBlocksModule } from './modules/user-blocks/user-blocks.module';
import { ReactionsModule } from './modules/reactions/reactions.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { LanLinkModule } from './modules/lanlink/lanlink.module';
import { FriendsModule } from './modules/friends/friends.module';
import { PresenceModule } from './modules/presence/presence.module';
import { ResourceCommentsModule } from './modules/resource-comments/resource-comments.module';
import { CapabilitiesModule } from './modules/capabilities/capabilities.module';
import { MediaModule } from './modules/media/media.module';
import { DownloadsModule } from './modules/downloads/downloads.module';
import { EventsModule } from './modules/events/events.module';
import { ThreadsModule } from './modules/threads/threads.module';
import { CreatorModule } from './modules/creator/creator.module';
import { GameVersionsModule } from './modules/game-versions/game-versions.module';
import { GameServersModule } from './modules/game-servers/game-servers.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { DiscoverModule } from './modules/discover/discover.module';
import { PortalModule } from './modules/portal/portal.module';
import { PhoneWriteGuard } from './common/guards/phone-write.guard';
import { BanGuard } from './common/guards/ban.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    DatabaseModule,
    // Avatars are public by nature, so serving them statically is fine.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads', 'avatars'),
      serveRoot: '/uploads/avatars',
    }),
    // Public images are intentionally uploaded for unauthenticated display (logos,
    // embeds, external API assets), unlike moderated attachments/resources below.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads', 'public-images'),
      serveRoot: '/uploads/public-images',
    }),
    // Attachments and resource files are NOT mounted statically: doing so served
    // them outside every controller, so files belonging to pending, rejected,
    // soft-deleted or group-restricted content were downloadable by path. They are
    // streamed instead by AttachmentsController and ResourcesController, which check
    // visibility first.
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
    CapabilitiesModule,
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
    UploadsModule,
    ServiceApiModule,
    ReportsModule,
    UserBlocksModule,
    ReactionsModule,
    LanLinkModule,
    FriendsModule,
    PresenceModule,
    ResourceCommentsModule,
    MediaModule,
    DownloadsModule,
    EventsModule,
    ThreadsModule,
    CreatorModule,
    GameVersionsModule,
    GameServersModule,
    KnowledgeModule,
    DiscoverModule,
    PortalModule,
  ],
  controllers: [HealthController],
  // Global guards run in registration order, before any controller-scoped guard.
  // BanGuard is first so a blocked IP is rejected without touching Redis or the
  // database; rate limiting comes next; PhoneWriteGuard last because it resolves
  // the session and is the most expensive.
  providers: [
    {
      provide: APP_GUARD,
      useClass: BanGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PhoneWriteGuard,
    },
  ],
})
export class AppModule {}

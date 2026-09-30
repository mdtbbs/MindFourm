import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MobileAuthV1Module } from '../auth/mobile-auth-v1.module';
import { PostsModule } from '../posts/posts.module';
import { RepliesModule } from '../replies/replies.module';
import { UsersModule } from '../users/users.module';
import { UsersV1Module } from '../users/v1/users-v1.module';
import { CategoriesModule } from '../categories/categories.module';
import { TagsModule } from '../tags/tags.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { BookmarksModule } from '../bookmarks/bookmarks.module';
import { BookmarksV1Module } from '../bookmarks/v1/bookmarks-v1.module';
import { LikesModule } from '../likes/likes.module';
import { MessagesModule } from '../messages/messages.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { CustomEmojisModule } from '../custom-emojis/custom-emojis.module';
import { AdminModule } from '../admin/admin.module';
import { BansModule } from '../bans/bans.module';
import { StatsModule } from '../stats/stats.module';
import { SettingsModule } from '../settings/settings.module';
import { LogsModule } from '../logs/logs.module';
import { PointsModule } from '../points/points.module';
import { LevelsModule } from '../levels/levels.module';
import { BadgesModule } from '../badges/badges.module';
import { FollowsModule } from '../follows/follows.module';
import { GroupsModule } from '../groups/groups.module';
import { ShopModule } from '../shop/shop.module';
import { RssModule } from '../rss/rss.module';
import { PluginsModule } from '../plugins/plugins.module';
import { SearchModule } from '../search/search.module';
import { ServiceApiModule } from '../service-api/service-api.module';
import { ReportsModule } from '../reports/reports.module';
import { UserBlocksModule } from '../user-blocks/user-blocks.module';
import { ReactionsModule } from '../reactions/reactions.module';
import { UploadsModule } from '../uploads/uploads.module';
import { FriendsModule } from '../friends/friends.module';
import { PresenceModule } from '../presence/presence.module';
import { CapabilitiesModule } from '../capabilities/capabilities.module';
import { MediaModule } from '../media/media.module';
import { DownloadsModule } from '../downloads/downloads.module';
import { EventsModule } from '../events/events.module';
import { ThreadsModule } from '../threads/threads.module';
import { CreatorModule } from '../creator/creator.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { NoticesModule } from '../notices/notices.module';
import { NavigationModule } from '../navigation/navigation.module';
import { PortalModule } from '../portal/portal.module';

@Module({
  imports: [
    AuthModule, MobileAuthV1Module, PostsModule, RepliesModule, UsersModule, UsersV1Module,
    CategoriesModule, TagsModule, NotificationsModule, AdminNotificationsModule, BookmarksModule,
    BookmarksV1Module, LikesModule, MessagesModule, AttachmentsModule, CustomEmojisModule, AdminModule, BansModule,
    StatsModule, SettingsModule, LogsModule, PointsModule, LevelsModule, BadgesModule, FollowsModule,
    GroupsModule, ShopModule, RssModule, PluginsModule, SearchModule, ServiceApiModule, ReportsModule,
    UserBlocksModule, ReactionsModule, UploadsModule, FriendsModule, PresenceModule, CapabilitiesModule,
    MediaModule, DownloadsModule, EventsModule, ThreadsModule, CreatorModule, KnowledgeModule,
    FeedbackModule, NoticesModule, NavigationModule, PortalModule,
  ],
})
export class CommunityCoreModule {}

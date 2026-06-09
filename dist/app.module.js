"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const serve_static_1 = require("@nestjs/serve-static");
const path_1 = require("path");
const app_config_1 = require("./config/app.config");
const database_module_1 = require("./database/database.module");
const health_controller_1 = require("./common/health.controller");
const auth_module_1 = require("./modules/auth/auth.module");
const posts_module_1 = require("./modules/posts/posts.module");
const replies_module_1 = require("./modules/replies/replies.module");
const users_module_1 = require("./modules/users/users.module");
const categories_module_1 = require("./modules/categories/categories.module");
const tags_module_1 = require("./modules/tags/tags.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const bookmarks_module_1 = require("./modules/bookmarks/bookmarks.module");
const likes_module_1 = require("./modules/likes/likes.module");
const messages_module_1 = require("./modules/messages/messages.module");
const attachments_module_1 = require("./modules/attachments/attachments.module");
const resources_module_1 = require("./modules/resources/resources.module");
const servers_module_1 = require("./modules/servers/servers.module");
const post_servers_module_1 = require("./modules/post-servers/post-servers.module");
const auto_post_module_1 = require("./modules/auto-post/auto-post.module");
const admin_module_1 = require("./modules/admin/admin.module");
const bans_module_1 = require("./modules/bans/bans.module");
const stats_module_1 = require("./modules/stats/stats.module");
const settings_module_1 = require("./modules/settings/settings.module");
const logs_module_1 = require("./modules/logs/logs.module");
const points_module_1 = require("./modules/points/points.module");
const levels_module_1 = require("./modules/levels/levels.module");
const badges_module_1 = require("./modules/badges/badges.module");
const follows_module_1 = require("./modules/follows/follows.module");
const groups_module_1 = require("./modules/groups/groups.module");
const shop_module_1 = require("./modules/shop/shop.module");
const rss_module_1 = require("./modules/rss/rss.module");
const plugins_module_1 = require("./modules/plugins/plugins.module");
const search_module_1 = require("./modules/search/search.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [app_config_1.appConfig],
            }),
            database_module_1.DatabaseModule,
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(__dirname, '..', 'uploads', 'avatars'),
                serveRoot: '/uploads/avatars',
            }),
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(__dirname, '..', 'uploads', 'attachments'),
                serveRoot: '/uploads/attachments',
            }),
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(__dirname, '..', 'uploads', 'resources'),
                serveRoot: '/uploads/resources',
            }),
            serve_static_1.ServeStaticModule.forRoot({
                rootPath: (0, path_1.join)(__dirname, '..', 'public'),
                serveRoot: '/public',
            }),
            auth_module_1.AuthModule,
            posts_module_1.PostsModule,
            replies_module_1.RepliesModule,
            users_module_1.UsersModule,
            categories_module_1.CategoriesModule,
            tags_module_1.TagsModule,
            notifications_module_1.NotificationsModule,
            bookmarks_module_1.BookmarksModule,
            likes_module_1.LikesModule,
            messages_module_1.MessagesModule,
            attachments_module_1.AttachmentsModule,
            resources_module_1.ResourcesModule,
            servers_module_1.ServersModule,
            post_servers_module_1.PostServersModule,
            auto_post_module_1.AutoPostModule,
            admin_module_1.AdminModule,
            bans_module_1.BansModule,
            stats_module_1.StatsModule,
            settings_module_1.SettingsModule,
            logs_module_1.LogsModule,
            points_module_1.PointsModule,
            levels_module_1.LevelsModule,
            badges_module_1.BadgesModule,
            follows_module_1.FollowsModule,
            groups_module_1.GroupsModule,
            shop_module_1.ShopModule,
            rss_module_1.RssModule,
            plugins_module_1.PluginsModule,
            search_module_1.SearchModule,
        ],
        controllers: [health_controller_1.HealthController],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map
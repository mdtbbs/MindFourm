"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const posts_service_1 = require("./posts.service");
const posts_controller_1 = require("./posts.controller");
const post_entity_1 = require("../../entities/post.entity");
const user_entity_1 = require("../../entities/user.entity");
const category_entity_1 = require("../../entities/category.entity");
const tag_entity_1 = require("../../entities/tag.entity");
const post_tag_entity_1 = require("../../entities/post-tag.entity");
const reply_entity_1 = require("../../entities/reply.entity");
const database_module_1 = require("../../database/database.module");
const points_module_1 = require("../points/points.module");
const groups_module_1 = require("../groups/groups.module");
const plugins_module_1 = require("../plugins/plugins.module");
const notifications_module_1 = require("../notifications/notifications.module");
const settings_module_1 = require("../settings/settings.module");
const logs_module_1 = require("../logs/logs.module");
let PostsModule = class PostsModule {
};
exports.PostsModule = PostsModule;
exports.PostsModule = PostsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule,
            points_module_1.PointsModule,
            groups_module_1.GroupsModule,
            plugins_module_1.PluginsModule,
            notifications_module_1.NotificationsModule,
            settings_module_1.SettingsModule,
            logs_module_1.LogsModule,
            typeorm_1.TypeOrmModule.forFeature([post_entity_1.Post, user_entity_1.User, category_entity_1.Category, tag_entity_1.Tag, post_tag_entity_1.PostTag, reply_entity_1.Reply]),
        ],
        providers: [posts_service_1.PostsService],
        controllers: [posts_controller_1.PostsController],
        exports: [posts_service_1.PostsService],
    })
], PostsModule);
//# sourceMappingURL=posts.module.js.map
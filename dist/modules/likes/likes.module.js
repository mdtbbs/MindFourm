"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LikesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const likes_service_1 = require("./likes.service");
const likes_controller_1 = require("./likes.controller");
const post_like_entity_1 = require("../../entities/post-like.entity");
const reply_like_entity_1 = require("../../entities/reply-like.entity");
const post_entity_1 = require("../../entities/post.entity");
const reply_entity_1 = require("../../entities/reply.entity");
const user_entity_1 = require("../../entities/user.entity");
const notification_entity_1 = require("../../entities/notification.entity");
const notifications_module_1 = require("../notifications/notifications.module");
const points_module_1 = require("../points/points.module");
let LikesModule = class LikesModule {
};
exports.LikesModule = LikesModule;
exports.LikesModule = LikesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([post_like_entity_1.PostLike, reply_like_entity_1.ReplyLike, post_entity_1.Post, reply_entity_1.Reply, user_entity_1.User, notification_entity_1.Notification]),
            notifications_module_1.NotificationsModule,
            points_module_1.PointsModule,
        ],
        controllers: [likes_controller_1.LikesController],
        providers: [likes_service_1.LikesService],
        exports: [likes_service_1.LikesService],
    })
], LikesModule);
//# sourceMappingURL=likes.module.js.map
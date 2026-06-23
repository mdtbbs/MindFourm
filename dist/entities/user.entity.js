"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const typeorm_1 = require("typeorm");
const post_entity_1 = require("./post.entity");
const reply_entity_1 = require("./reply.entity");
const bookmark_entity_1 = require("./bookmark.entity");
const notification_entity_1 = require("./notification.entity");
const message_entity_1 = require("./message.entity");
const resource_entity_1 = require("./resource.entity");
const post_like_entity_1 = require("./post-like.entity");
const reply_like_entity_1 = require("./reply-like.entity");
const ban_entity_1 = require("./ban.entity");
const operation_log_entity_1 = require("./operation-log.entity");
const point_log_entity_1 = require("./point-log.entity");
const follow_entity_1 = require("./follow.entity");
const user_badge_entity_1 = require("./user-badge.entity");
const group_member_entity_1 = require("./group-member.entity");
const purchase_entity_1 = require("./purchase.entity");
let User = class User {
};
exports.User = User;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], User.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    __metadata("design:type", Number)
], User.prototype, "mindauth_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 255 }),
    __metadata("design:type", String)
], User.prototype, "username", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 255 }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 50, default: 'user' }),
    __metadata("design:type", String)
], User.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 500, nullable: true }),
    __metadata("design:type", String)
], User.prototype, "avatar_url", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 500, nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "pending_avatar_url", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 30, default: 'approved' }),
    __metadata("design:type", String)
], User.prototype, "avatar_status", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], User.prototype, "bio", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "total_points", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "available_points", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], User.prototype, "reply_email", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], User.prototype, "mention_email", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], User.prototype, "message_email", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], User.prototype, "system_email", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "digest_email", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], User.prototype, "phone_verified", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'datetime', nullable: true }),
    __metadata("design:type", Object)
], User.prototype, "phone_verified_at", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], User.prototype, "created_at", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], User.prototype, "updated_at", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => post_entity_1.Post, (post) => post.user),
    __metadata("design:type", Array)
], User.prototype, "posts", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => reply_entity_1.Reply, (reply) => reply.user),
    __metadata("design:type", Array)
], User.prototype, "replies", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => bookmark_entity_1.Bookmark, (bookmark) => bookmark.user),
    __metadata("design:type", Array)
], User.prototype, "bookmarks", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => notification_entity_1.Notification, (notification) => notification.user),
    __metadata("design:type", Array)
], User.prototype, "notifications", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => notification_entity_1.Notification, (notification) => notification.actor),
    __metadata("design:type", Array)
], User.prototype, "sentNotifications", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => message_entity_1.Message, (message) => message.sender),
    __metadata("design:type", Array)
], User.prototype, "sentMessages", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => message_entity_1.Message, (message) => message.recipient),
    __metadata("design:type", Array)
], User.prototype, "receivedMessages", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => resource_entity_1.Resource, (resource) => resource.user),
    __metadata("design:type", Array)
], User.prototype, "resources", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => post_like_entity_1.PostLike, (postLike) => postLike.user),
    __metadata("design:type", Array)
], User.prototype, "postLikes", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => reply_like_entity_1.ReplyLike, (replyLike) => replyLike.user),
    __metadata("design:type", Array)
], User.prototype, "replyLikes", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => ban_entity_1.Ban, (ban) => ban.creator),
    __metadata("design:type", Array)
], User.prototype, "createdBans", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => operation_log_entity_1.OperationLog, (log) => log.user),
    __metadata("design:type", Array)
], User.prototype, "operationLogs", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => point_log_entity_1.PointLog, (pointLog) => pointLog.user),
    __metadata("design:type", Array)
], User.prototype, "pointLogs", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => follow_entity_1.Follow, (follow) => follow.follower),
    __metadata("design:type", Array)
], User.prototype, "following", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => follow_entity_1.Follow, (follow) => follow.following),
    __metadata("design:type", Array)
], User.prototype, "followers", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => user_badge_entity_1.UserBadge, (userBadge) => userBadge.user),
    __metadata("design:type", Array)
], User.prototype, "userBadges", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => user_badge_entity_1.UserBadge, (userBadge) => userBadge.granter),
    __metadata("design:type", Array)
], User.prototype, "grantedBadges", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => group_member_entity_1.GroupMember, (member) => member.user),
    __metadata("design:type", Array)
], User.prototype, "groupMemberships", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => purchase_entity_1.Purchase, (purchase) => purchase.user),
    __metadata("design:type", Array)
], User.prototype, "purchases", void 0);
exports.User = User = __decorate([
    (0, typeorm_1.Entity)('users')
], User);
//# sourceMappingURL=user.entity.js.map
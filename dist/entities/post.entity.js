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
exports.Post = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
const category_entity_1 = require("./category.entity");
const reply_entity_1 = require("./reply.entity");
const bookmark_entity_1 = require("./bookmark.entity");
const attachment_entity_1 = require("./attachment.entity");
const notification_entity_1 = require("./notification.entity");
const post_like_entity_1 = require("./post-like.entity");
const post_tag_entity_1 = require("./post-tag.entity");
const group_entity_1 = require("./group.entity");
let Post = class Post {
};
exports.Post = Post;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Post.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], Post.prototype, "user_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], Post.prototype, "category_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], Post.prototype, "server_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], Post.prototype, "required_group_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 50, default: 'normal' }),
    __metadata("design:type", String)
], Post.prototype, "post_type", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 255 }),
    __metadata("design:type", String)
], Post.prototype, "title", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text' }),
    __metadata("design:type", String)
], Post.prototype, "content", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], Post.prototype, "content_html", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 50, default: 'draft' }),
    __metadata("design:type", String)
], Post.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Post.prototype, "is_pinned", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Post.prototype, "view_count", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Post.prototype, "like_count", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Post.prototype, "created_at", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Post.prototype, "updated_at", void 0);
__decorate([
    (0, typeorm_1.DeleteDateColumn)(),
    __metadata("design:type", Date)
], Post.prototype, "deleted_at", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { eager: false }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_1.User)
], Post.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => category_entity_1.Category, { eager: false, nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'category_id' }),
    __metadata("design:type", category_entity_1.Category)
], Post.prototype, "category", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => group_entity_1.Group, { eager: false, nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'required_group_id' }),
    __metadata("design:type", group_entity_1.Group)
], Post.prototype, "requiredGroup", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => reply_entity_1.Reply, (reply) => reply.post),
    __metadata("design:type", Array)
], Post.prototype, "replies", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => bookmark_entity_1.Bookmark, (bookmark) => bookmark.post),
    __metadata("design:type", Array)
], Post.prototype, "bookmarks", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => attachment_entity_1.Attachment, (attachment) => attachment.post),
    __metadata("design:type", Array)
], Post.prototype, "attachments", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => notification_entity_1.Notification, (notification) => notification.post),
    __metadata("design:type", Array)
], Post.prototype, "notifications", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => post_like_entity_1.PostLike, (postLike) => postLike.post),
    __metadata("design:type", Array)
], Post.prototype, "likes", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => post_tag_entity_1.PostTag, (postTag) => postTag.post),
    __metadata("design:type", Array)
], Post.prototype, "postTags", void 0);
exports.Post = Post = __decorate([
    (0, typeorm_1.Entity)('posts')
], Post);
//# sourceMappingURL=post.entity.js.map
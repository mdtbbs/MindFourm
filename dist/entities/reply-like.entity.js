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
exports.ReplyLike = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
const reply_entity_1 = require("./reply.entity");
let ReplyLike = class ReplyLike {
};
exports.ReplyLike = ReplyLike;
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", Number)
], ReplyLike.prototype, "user_id", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", Number)
], ReplyLike.prototype, "reply_id", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ReplyLike.prototype, "created_at", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { eager: false }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_1.User)
], ReplyLike.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => reply_entity_1.Reply, { eager: false }),
    (0, typeorm_1.JoinColumn)({ name: 'reply_id' }),
    __metadata("design:type", reply_entity_1.Reply)
], ReplyLike.prototype, "reply", void 0);
exports.ReplyLike = ReplyLike = __decorate([
    (0, typeorm_1.Entity)('reply_likes')
], ReplyLike);
//# sourceMappingURL=reply-like.entity.js.map
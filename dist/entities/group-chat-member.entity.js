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
exports.GroupChatMember = void 0;
const typeorm_1 = require("typeorm");
const group_chat_entity_1 = require("./group-chat.entity");
const user_entity_1 = require("./user.entity");
let GroupChatMember = class GroupChatMember {
};
exports.GroupChatMember = GroupChatMember;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], GroupChatMember.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], GroupChatMember.prototype, "group_chat_id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], GroupChatMember.prototype, "user_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 20, default: 'member' }),
    __metadata("design:type", String)
], GroupChatMember.prototype, "role", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], GroupChatMember.prototype, "joined_at", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => group_chat_entity_1.GroupChat, { eager: false }),
    (0, typeorm_1.JoinColumn)({ name: 'group_chat_id' }),
    __metadata("design:type", group_chat_entity_1.GroupChat)
], GroupChatMember.prototype, "groupChat", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { eager: false }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_1.User)
], GroupChatMember.prototype, "user", void 0);
exports.GroupChatMember = GroupChatMember = __decorate([
    (0, typeorm_1.Entity)('group_chat_members'),
    (0, typeorm_1.Unique)(['group_chat_id', 'user_id'])
], GroupChatMember);
//# sourceMappingURL=group-chat-member.entity.js.map
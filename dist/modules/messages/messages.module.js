"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessagesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const messages_service_1 = require("./messages.service");
const messages_controller_1 = require("./messages.controller");
const message_entity_1 = require("../../entities/message.entity");
const user_entity_1 = require("../../entities/user.entity");
const group_chat_entity_1 = require("../../entities/group-chat.entity");
const group_chat_member_entity_1 = require("../../entities/group-chat-member.entity");
const notifications_module_1 = require("../notifications/notifications.module");
let MessagesModule = class MessagesModule {
};
exports.MessagesModule = MessagesModule;
exports.MessagesModule = MessagesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([message_entity_1.Message, user_entity_1.User, group_chat_entity_1.GroupChat, group_chat_member_entity_1.GroupChatMember]),
            notifications_module_1.NotificationsModule,
        ],
        controllers: [messages_controller_1.MessagesController, messages_controller_1.GroupChatsController],
        providers: [messages_service_1.MessagesService],
        exports: [messages_service_1.MessagesService],
    })
], MessagesModule);
//# sourceMappingURL=messages.module.js.map
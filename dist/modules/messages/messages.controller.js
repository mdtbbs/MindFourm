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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupChatsController = exports.MessagesController = void 0;
const common_1 = require("@nestjs/common");
const messages_service_1 = require("./messages.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const create_group_chat_dto_1 = require("./dto/create-group-chat.dto");
let MessagesController = class MessagesController {
    constructor(messagesService) {
        this.messagesService = messagesService;
    }
    async send(dto, req) {
        return this.messagesService.create(dto, req.user?.id);
    }
    async getConversations(req, limit = '20', cursor) {
        return this.messagesService.getConversations(req.user?.id, Number(limit), cursor);
    }
    async unreadCount(req) {
        return { count: await this.messagesService.getUnreadCount(req.user?.id) };
    }
    async getConversation(req, userId, limit = '50', cursor) {
        return this.messagesService.getConversation(req.user?.id, userId, Number(limit), cursor);
    }
    async deleteMessage(id, req) {
        return this.messagesService.deleteForUser(id, req.user?.id, false);
    }
};
exports.MessagesController = MessagesController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "send", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('cursor')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "getConversations", null);
__decorate([
    (0, common_1.Get)('unread-count'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "unreadCount", null);
__decorate([
    (0, common_1.Get)(':userId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('userId', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('cursor')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, Object, String]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "getConversation", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], MessagesController.prototype, "deleteMessage", null);
exports.MessagesController = MessagesController = __decorate([
    (0, common_1.Controller)('messages'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [messages_service_1.MessagesService])
], MessagesController);
let GroupChatsController = class GroupChatsController {
    constructor(messagesService) {
        this.messagesService = messagesService;
    }
    async createGroupChat(dto, req) {
        const groupChat = await this.messagesService.createGroupChat(dto, req.user?.id);
        return { success: true, data: groupChat };
    }
    async getMyGroupChats(req) {
        const groupChats = await this.messagesService.getMyGroupChats(req.user?.id);
        return { success: true, data: groupChats };
    }
    async getGroupChat(id, req) {
        const groupChat = await this.messagesService.getGroupChat(id, req.user?.id);
        return { success: true, data: groupChat };
    }
    async getGroupMessages(id, req, limit = '50', cursor) {
        return this.messagesService.getGroupMessages(id, req.user?.id, Number(limit), cursor);
    }
    async sendGroupMessage(id, dto, req) {
        const message = await this.messagesService.sendGroupMessage(id, req.user?.id, dto.content);
        return { success: true, data: message };
    }
    async addGroupMember(id, dto) {
        const member = await this.messagesService.addGroupMember(id, dto.user_id, dto.role || 'member');
        return { success: true, data: member };
    }
    async removeGroupMember(id, userId) {
        await this.messagesService.removeGroupMember(id, userId);
        return { success: true, data: { message: '成员已移除' } };
    }
    async leaveGroupChat(id, req) {
        await this.messagesService.leaveGroupChat(id, req.user?.id);
        return { success: true, data: { message: '已离开群聊' } };
    }
    async updateGroupChat(id, dto, req) {
        const groupChat = await this.messagesService.updateGroupChat(id, req.user?.id, dto);
        return { success: true, data: groupChat };
    }
};
exports.GroupChatsController = GroupChatsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_group_chat_dto_1.CreateGroupChatDto, Object]),
    __metadata("design:returntype", Promise)
], GroupChatsController.prototype, "createGroupChat", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], GroupChatsController.prototype, "getMyGroupChats", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], GroupChatsController.prototype, "getGroupChat", null);
__decorate([
    (0, common_1.Get)(':id/messages'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('cursor')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object, Object, String]),
    __metadata("design:returntype", Promise)
], GroupChatsController.prototype, "getGroupMessages", null);
__decorate([
    (0, common_1.Post)(':id/messages'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object, Object]),
    __metadata("design:returntype", Promise)
], GroupChatsController.prototype, "sendGroupMessage", null);
__decorate([
    (0, common_1.Post)(':id/members'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], GroupChatsController.prototype, "addGroupMember", null);
__decorate([
    (0, common_1.Delete)(':id/members/:userId'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Param)('userId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], GroupChatsController.prototype, "removeGroupMember", null);
__decorate([
    (0, common_1.Post)(':id/leave'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], GroupChatsController.prototype, "leaveGroupChat", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object, Object]),
    __metadata("design:returntype", Promise)
], GroupChatsController.prototype, "updateGroupChat", null);
exports.GroupChatsController = GroupChatsController = __decorate([
    (0, common_1.Controller)('group-chats'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [messages_service_1.MessagesService])
], GroupChatsController);
//# sourceMappingURL=messages.controller.js.map
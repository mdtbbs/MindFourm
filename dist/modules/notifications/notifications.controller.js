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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const notifications_service_1 = require("./notifications.service");
const query_notifications_dto_1 = require("./dto/query-notifications.dto");
const update_email_preference_dto_1 = require("./dto/update-email-preference.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const rxjs_1 = require("rxjs");
let NotificationsController = class NotificationsController {
    constructor(notificationsService) {
        this.notificationsService = notificationsService;
        this.notificationSubjects = new Map();
    }
    onModuleInit() {
    }
    onModuleDestroy() {
        for (const subject of this.notificationSubjects.values()) {
            subject.complete();
        }
        this.notificationSubjects.clear();
    }
    sseEvents(req) {
        const userId = req.user.id;
        if (!this.notificationSubjects.has(userId)) {
            this.notificationSubjects.set(userId, new rxjs_1.Subject());
        }
        const subject = this.notificationSubjects.get(userId);
        if (!subject) {
            throw new Error('Failed to create SSE subject');
        }
        subject.next({
            data: JSON.stringify({ type: 'connected', userId }),
        });
        return subject.asObservable();
    }
    pushNotification(userId, notification) {
        const subject = this.notificationSubjects.get(userId);
        if (subject) {
            subject.next({
                data: JSON.stringify({ type: 'notification', data: notification }),
            });
        }
    }
    async getNotifications(req, query) {
        const userId = req.user.id;
        const result = await this.notificationsService.getByUserId(userId, query.page, query.limit);
        return {
            data: result.notifications,
            pagination: {
                page: query.page,
                limit: query.limit,
                total: result.total,
            },
        };
    }
    async getNotificationsCursor(req, limit, cursor) {
        const userId = req.user.id;
        const result = await this.notificationsService.getByUserIdCursor(userId, limit ? Number(limit) : 20, cursor);
        return {
            data: result.notifications,
            nextCursor: result.nextCursor,
        };
    }
    async getUnreadCount(req) {
        const userId = req.user.id;
        const count = await this.notificationsService.getUnreadCount(userId);
        return { count };
    }
    async markAsRead(id, req) {
        const userId = req.user.id;
        await this.notificationsService.markAsRead(Number(id), userId);
        return { message: 'Notification marked as read' };
    }
    async markAllAsRead(req) {
        const userId = req.user.id;
        await this.notificationsService.markAllAsRead(userId);
        return { message: 'All notifications marked as read' };
    }
    async getEmailPreference(req) {
        const userId = req.user.id;
        const preference = await this.notificationsService.getEmailPreference(userId);
        return { data: preference };
    }
    async updateEmailPreference(req, dto) {
        const userId = req.user.id;
        const preference = await this.notificationsService.updateEmailPreference(userId, dto);
        return { data: preference };
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Sse)('events'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", rxjs_1.Observable)
], NotificationsController.prototype, "sseEvents", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, query_notifications_dto_1.QueryNotificationsDto]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getNotifications", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('cursor'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('cursor')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getNotificationsCursor", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('unread-count'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getUnreadCount", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Put)(':id/read'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "markAsRead", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Put)('read-all'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "markAllAsRead", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Get)('email-preference'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "getEmailPreference", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Put)('email-preference'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_email_preference_dto_1.UpdateEmailPreferenceDto]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "updateEmailPreference", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, common_1.Controller)('notifications'),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const notifications_service_1 = require("./notifications.service");
const notifications_controller_1 = require("./notifications.controller");
const email_service_1 = require("./email.service");
const email_queue_service_1 = require("./email-queue.service");
const template_service_1 = require("./template.service");
const notification_entity_1 = require("../../entities/notification.entity");
const user_entity_1 = require("../../entities/user.entity");
const post_entity_1 = require("../../entities/post.entity");
const reply_entity_1 = require("../../entities/reply.entity");
const email_log_entity_1 = require("../../entities/email-log.entity");
const settings_module_1 = require("../settings/settings.module");
let NotificationsModule = class NotificationsModule {
};
exports.NotificationsModule = NotificationsModule;
exports.NotificationsModule = NotificationsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([notification_entity_1.Notification, user_entity_1.User, post_entity_1.Post, reply_entity_1.Reply, email_log_entity_1.EmailLog]),
            settings_module_1.SettingsModule,
        ],
        providers: [notifications_service_1.NotificationsService, email_service_1.EmailService, email_queue_service_1.EmailQueueService, template_service_1.TemplateService],
        exports: [notifications_service_1.NotificationsService, email_service_1.EmailService, email_queue_service_1.EmailQueueService, template_service_1.TemplateService],
        controllers: [notifications_controller_1.NotificationsController],
    })
], NotificationsModule);
//# sourceMappingURL=notifications.module.js.map
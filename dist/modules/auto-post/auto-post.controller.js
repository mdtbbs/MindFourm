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
exports.AutoPostController = void 0;
const common_1 = require("@nestjs/common");
const auto_post_service_1 = require("./auto-post.service");
const service_auth_guard_1 = require("../../common/guards/service-auth.guard");
const server_approved_callback_dto_1 = require("./dto/server-approved-callback.dto");
const skip_phone_verification_decorator_1 = require("../../common/decorators/skip-phone-verification.decorator");
let AutoPostController = class AutoPostController {
    constructor(autoPostService) {
        this.autoPostService = autoPostService;
    }
    async handleServerApproved(dto) {
        const result = await this.autoPostService.createServerAnnouncement({
            server_name: dto.server_name,
            server_id: dto.server_id,
            description: dto.description,
            category_slug: dto.category_slug,
            event_id: dto.event_id,
        });
        if (!result.created) {
            return {
                success: true,
                post_id: result.post.id,
                message: 'Server announcement already exists',
                duplicate: true,
            };
        }
        return {
            success: true,
            post_id: result.post.id,
            created: true,
        };
    }
};
exports.AutoPostController = AutoPostController;
__decorate([
    (0, common_1.Post)('server-approved'),
    (0, skip_phone_verification_decorator_1.SkipPhoneVerification)(),
    (0, common_1.UseGuards)(service_auth_guard_1.ServiceAuthGuard),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [server_approved_callback_dto_1.ServerApprovedCallbackDto]),
    __metadata("design:returntype", Promise)
], AutoPostController.prototype, "handleServerApproved", null);
exports.AutoPostController = AutoPostController = __decorate([
    (0, common_1.Controller)('auto-post'),
    __metadata("design:paramtypes", [auto_post_service_1.AutoPostService])
], AutoPostController);
//# sourceMappingURL=auto-post.controller.js.map
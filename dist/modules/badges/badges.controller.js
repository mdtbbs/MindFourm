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
exports.BadgesController = void 0;
const common_1 = require("@nestjs/common");
const badges_service_1 = require("./badges.service");
const badge_dto_1 = require("./dto/badge.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
let BadgesController = class BadgesController {
    constructor(badgesService) {
        this.badgesService = badgesService;
    }
    async getAllBadges() {
        const badges = await this.badgesService.getAllBadges();
        return { success: true, data: badges };
    }
    async getUserBadges(userId) {
        const userBadges = await this.badgesService.getUserBadges(userId);
        return { success: true, data: userBadges };
    }
    async adminGetAllBadges() {
        const badges = await this.badgesService.adminGetAllBadges();
        return { success: true, data: badges };
    }
    async adminCreateBadge(dto) {
        const badge = await this.badgesService.adminCreateBadge(dto);
        return { success: true, data: badge };
    }
    async adminUpdateBadge(id, dto) {
        const badge = await this.badgesService.adminUpdateBadge(id, dto);
        return { success: true, data: badge };
    }
    async adminDeleteBadge(id) {
        await this.badgesService.adminDeleteBadge(id);
        return { success: true, data: { message: '徽章已删除' } };
    }
    async awardBadge(dto) {
        const userBadge = await this.badgesService.awardBadge(dto.user_id, dto.badge_id);
        return { success: true, data: userBadge };
    }
};
exports.BadgesController = BadgesController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BadgesController.prototype, "getAllBadges", null);
__decorate([
    (0, common_1.Get)('user/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], BadgesController.prototype, "getUserBadges", null);
__decorate([
    (0, common_1.Get)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BadgesController.prototype, "adminGetAllBadges", null);
__decorate([
    (0, common_1.Post)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [badge_dto_1.CreateBadgeDto]),
    __metadata("design:returntype", Promise)
], BadgesController.prototype, "adminCreateBadge", null);
__decorate([
    (0, common_1.Put)('admin/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, badge_dto_1.UpdateBadgeDto]),
    __metadata("design:returntype", Promise)
], BadgesController.prototype, "adminUpdateBadge", null);
__decorate([
    (0, common_1.Delete)('admin/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], BadgesController.prototype, "adminDeleteBadge", null);
__decorate([
    (0, common_1.Post)('admin/award'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [badge_dto_1.AwardBadgeDto]),
    __metadata("design:returntype", Promise)
], BadgesController.prototype, "awardBadge", null);
exports.BadgesController = BadgesController = __decorate([
    (0, common_1.Controller)('badges'),
    __metadata("design:paramtypes", [badges_service_1.BadgesService])
], BadgesController);
//# sourceMappingURL=badges.controller.js.map
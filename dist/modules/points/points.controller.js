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
exports.PointsController = void 0;
const common_1 = require("@nestjs/common");
const points_service_1 = require("./points.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const point_history_dto_1 = require("./dto/point-history.dto");
const leaderboard_dto_1 = require("./dto/leaderboard.dto");
const admin_points_dto_1 = require("./dto/admin-points.dto");
let PointsController = class PointsController {
    constructor(pointsService) {
        this.pointsService = pointsService;
    }
    async getMyPoints(req) {
        const userId = req.user?.id;
        const points = await this.pointsService.getUserPoints(userId);
        return { success: true, data: points };
    }
    async getMyHistory(req, query) {
        const userId = req.user?.id;
        const result = await this.pointsService.getHistory(userId, query.limit || 20, query.cursor);
        return { success: true, data: result };
    }
    async getLeaderboard(query) {
        const result = await this.pointsService.getLeaderboard(query.limit || 20, query.page || 1);
        return { success: true, data: result };
    }
    async getRules() {
        const rules = await this.pointsService.getRules();
        return { success: true, data: rules };
    }
    async getAdminRules() {
        const rules = await this.pointsService.getRules();
        return { success: true, data: rules };
    }
    async createRule(dto) {
        const rule = await this.pointsService.createRule(dto);
        return { success: true, data: rule };
    }
    async updateRule(id, dto) {
        const rule = await this.pointsService.updateRule(id, dto);
        return { success: true, data: rule };
    }
    async deleteRule(id) {
        await this.pointsService.deleteRule(id);
        return { success: true, data: { message: '规则已删除' } };
    }
    async awardPoints(dto) {
        const log = await this.pointsService.awardPointsManual(dto.user_id, dto.points, dto.reason);
        return { success: true, data: log };
    }
};
exports.PointsController = PointsController;
__decorate([
    (0, common_1.Get)('me'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "getMyPoints", null);
__decorate([
    (0, common_1.Get)('me/history'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, point_history_dto_1.QueryPointHistoryDto]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "getMyHistory", null);
__decorate([
    (0, common_1.Get)('leaderboard'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [leaderboard_dto_1.QueryLeaderboardDto]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "getLeaderboard", null);
__decorate([
    (0, common_1.Get)('rules'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "getRules", null);
__decorate([
    (0, common_1.Get)('admin/rules'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "getAdminRules", null);
__decorate([
    (0, common_1.Post)('admin/rules'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_points_dto_1.CreatePointRuleDto]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "createRule", null);
__decorate([
    (0, common_1.Put)('admin/rules/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, admin_points_dto_1.UpdatePointRuleDto]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "updateRule", null);
__decorate([
    (0, common_1.Delete)('admin/rules/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "deleteRule", null);
__decorate([
    (0, common_1.Post)('admin/award'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_points_dto_1.AwardPointsDto]),
    __metadata("design:returntype", Promise)
], PointsController.prototype, "awardPoints", null);
exports.PointsController = PointsController = __decorate([
    (0, common_1.Controller)('points'),
    __metadata("design:paramtypes", [points_service_1.PointsService])
], PointsController);
//# sourceMappingURL=points.controller.js.map
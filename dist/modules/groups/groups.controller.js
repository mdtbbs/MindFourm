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
exports.GroupsController = void 0;
const common_1 = require("@nestjs/common");
const groups_service_1 = require("./groups.service");
const group_dto_1 = require("./dto/group.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
let GroupsController = class GroupsController {
    constructor(groupsService) {
        this.groupsService = groupsService;
    }
    async getAllGroups() {
        const groups = await this.groupsService.getAllGroups();
        return { success: true, data: groups };
    }
    async getGroupBySlug(slug) {
        const group = await this.groupsService.getGroupBySlug(slug);
        return { success: true, data: group };
    }
    async getGroupMembers(slug, query) {
        const result = await this.groupsService.getGroupMembers(slug, query.page || 1, query.limit || 20);
        return { success: true, data: result };
    }
    async joinGroup(id, userId) {
        const member = await this.groupsService.joinGroup(id, userId);
        return { success: true, data: member };
    }
    async leaveGroup(id, userId) {
        await this.groupsService.leaveGroup(id, userId);
        return { success: true, data: { message: '已离开该组' } };
    }
    async getMyGroups(userId) {
        const groups = await this.groupsService.getMyGroups(userId);
        return { success: true, data: groups };
    }
    async adminGetAllGroups() {
        const groups = await this.groupsService.adminGetAllGroups();
        return { success: true, data: groups };
    }
    async adminCreateGroup(dto) {
        const group = await this.groupsService.adminCreateGroup(dto);
        return { success: true, data: group };
    }
    async adminUpdateGroup(id, dto) {
        const group = await this.groupsService.adminUpdateGroup(id, dto);
        return { success: true, data: group };
    }
    async adminDeleteGroup(id) {
        await this.groupsService.adminDeleteGroup(id);
        return { success: true, data: { message: '组已删除' } };
    }
    async adminAddMember(id, dto) {
        const member = await this.groupsService.adminAddMember(id, dto.user_id, dto.role || 'member');
        return { success: true, data: member };
    }
    async adminRemoveMember(id, userId) {
        await this.groupsService.adminRemoveMember(id, userId);
        return { success: true, data: { message: '成员已移除' } };
    }
};
exports.GroupsController = GroupsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GroupsController.prototype, "getAllGroups", null);
__decorate([
    (0, common_1.Get)(':slug'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GroupsController.prototype, "getGroupBySlug", null);
__decorate([
    (0, common_1.Get)(':slug/members'),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, group_dto_1.QueryGroupsDto]),
    __metadata("design:returntype", Promise)
], GroupsController.prototype, "getGroupMembers", null);
__decorate([
    (0, common_1.Post)(':id/join'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], GroupsController.prototype, "joinGroup", null);
__decorate([
    (0, common_1.Post)(':id/leave'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], GroupsController.prototype, "leaveGroup", null);
__decorate([
    (0, common_1.Get)('my'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Query)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], GroupsController.prototype, "getMyGroups", null);
__decorate([
    (0, common_1.Get)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GroupsController.prototype, "adminGetAllGroups", null);
__decorate([
    (0, common_1.Post)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [group_dto_1.CreateGroupDto]),
    __metadata("design:returntype", Promise)
], GroupsController.prototype, "adminCreateGroup", null);
__decorate([
    (0, common_1.Put)('admin/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, group_dto_1.UpdateGroupDto]),
    __metadata("design:returntype", Promise)
], GroupsController.prototype, "adminUpdateGroup", null);
__decorate([
    (0, common_1.Delete)('admin/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], GroupsController.prototype, "adminDeleteGroup", null);
__decorate([
    (0, common_1.Post)('admin/:id/members'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, group_dto_1.AddGroupMemberDto]),
    __metadata("design:returntype", Promise)
], GroupsController.prototype, "adminAddMember", null);
__decorate([
    (0, common_1.Delete)('admin/:id/members/:userId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], GroupsController.prototype, "adminRemoveMember", null);
exports.GroupsController = GroupsController = __decorate([
    (0, common_1.Controller)('groups'),
    __metadata("design:paramtypes", [groups_service_1.GroupsService])
], GroupsController);
//# sourceMappingURL=groups.controller.js.map
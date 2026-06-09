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
exports.ServersController = void 0;
const common_1 = require("@nestjs/common");
const servers_service_1 = require("./servers.service");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
let ServersController = class ServersController {
    constructor(serversService) {
        this.serversService = serversService;
    }
    async getPublicServers() {
        return this.serversService.getPublicServers();
    }
    async getAvailableVersions() {
        return this.serversService.getAvailableVersions();
    }
    async getTemplates() {
        return this.serversService.getPublicTemplates();
    }
    async getServerBasic(id) {
        return this.serversService.getServerBasic(id);
    }
    async getUserServers(req) {
        return this.serversService.getUserServers(req.user?.mindauth_id);
    }
    async applyServer(req, body) {
        return this.serversService.applyServer(req.user?.mindauth_id, body);
    }
};
exports.ServersController = ServersController;
__decorate([
    (0, common_1.Get)('public'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ServersController.prototype, "getPublicServers", null);
__decorate([
    (0, common_1.Get)('versions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ServersController.prototype, "getAvailableVersions", null);
__decorate([
    (0, common_1.Get)('templates'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ServersController.prototype, "getTemplates", null);
__decorate([
    (0, common_1.Get)(':id/basic'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], ServersController.prototype, "getServerBasic", null);
__decorate([
    (0, common_1.Get)('my'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ServersController.prototype, "getUserServers", null);
__decorate([
    (0, common_1.Post)('apply'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ServersController.prototype, "applyServer", null);
exports.ServersController = ServersController = __decorate([
    (0, common_1.Controller)('servers'),
    __metadata("design:paramtypes", [servers_service_1.ServersService])
], ServersController);
//# sourceMappingURL=servers.controller.js.map
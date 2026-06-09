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
exports.PluginsController = void 0;
const common_1 = require("@nestjs/common");
const plugin_manager_service_1 = require("./plugin-manager.service");
const plugin_dto_1 = require("./dto/plugin.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
let PluginsController = class PluginsController {
    constructor(pluginManager) {
        this.pluginManager = pluginManager;
    }
    async getPlugins() {
        const plugins = await this.pluginManager.getPlugins();
        return { success: true, data: plugins };
    }
    async getPlugin(slug) {
        const plugin = await this.pluginManager.getPlugin(slug);
        return { success: true, data: plugin };
    }
    async installPlugin(metadata) {
        const plugin = await this.pluginManager.install(metadata);
        return { success: true, data: plugin };
    }
    async uninstallPlugin(slug) {
        await this.pluginManager.uninstall(slug);
        return { success: true, data: { message: '插件已卸载' } };
    }
    async enablePlugin(slug) {
        await this.pluginManager.enable(slug);
        return { success: true, data: { message: '插件已启用' } };
    }
    async disablePlugin(slug) {
        await this.pluginManager.disable(slug);
        return { success: true, data: { message: '插件已禁用' } };
    }
    async getConfig(slug) {
        const config = await this.pluginManager.getConfig(slug);
        return { success: true, data: config };
    }
    async updateConfig(slug, config) {
        await this.pluginManager.configure(slug, config.config);
        return { success: true, data: { message: '配置已更新' } };
    }
    async getPluginHooks(slug) {
        const hooks = await this.pluginManager.getPluginHooks(slug);
        return { success: true, data: hooks };
    }
};
exports.PluginsController = PluginsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PluginsController.prototype, "getPlugins", null);
__decorate([
    (0, common_1.Get)(':slug'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PluginsController.prototype, "getPlugin", null);
__decorate([
    (0, common_1.Post)('install'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [plugin_dto_1.PluginMetadata]),
    __metadata("design:returntype", Promise)
], PluginsController.prototype, "installPlugin", null);
__decorate([
    (0, common_1.Delete)(':slug'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PluginsController.prototype, "uninstallPlugin", null);
__decorate([
    (0, common_1.Post)(':slug/enable'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PluginsController.prototype, "enablePlugin", null);
__decorate([
    (0, common_1.Post)(':slug/disable'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PluginsController.prototype, "disablePlugin", null);
__decorate([
    (0, common_1.Get)(':slug/config'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PluginsController.prototype, "getConfig", null);
__decorate([
    (0, common_1.Put)(':slug/config'),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, plugin_dto_1.UpdatePluginConfigDto]),
    __metadata("design:returntype", Promise)
], PluginsController.prototype, "updateConfig", null);
__decorate([
    (0, common_1.Get)(':slug/hooks'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PluginsController.prototype, "getPluginHooks", null);
exports.PluginsController = PluginsController = __decorate([
    (0, common_1.Controller)('plugins'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __metadata("design:paramtypes", [plugin_manager_service_1.PluginManagerService])
], PluginsController);
//# sourceMappingURL=plugins.controller.js.map
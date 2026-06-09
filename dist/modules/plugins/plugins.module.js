"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const plugin_entity_1 = require("../../entities/plugin.entity");
const plugin_hook_entity_1 = require("../../entities/plugin-hook.entity");
const plugin_config_entity_1 = require("../../entities/plugin-config.entity");
const plugin_permission_entity_1 = require("../../entities/plugin-permission.entity");
const plugin_manager_service_1 = require("./plugin-manager.service");
const event_bus_service_1 = require("./event-bus.service");
const plugins_controller_1 = require("./plugins.controller");
let PluginsModule = class PluginsModule {
};
exports.PluginsModule = PluginsModule;
exports.PluginsModule = PluginsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([plugin_entity_1.Plugin, plugin_hook_entity_1.PluginHook, plugin_config_entity_1.PluginConfig, plugin_permission_entity_1.PluginPermission])],
        controllers: [plugins_controller_1.PluginsController],
        providers: [event_bus_service_1.EventBusService, plugin_manager_service_1.PluginManagerService],
        exports: [event_bus_service_1.EventBusService, plugin_manager_service_1.PluginManagerService],
    })
], PluginsModule);
//# sourceMappingURL=plugins.module.js.map
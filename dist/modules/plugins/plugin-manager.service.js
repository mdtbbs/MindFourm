"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PluginManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginManagerService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const plugin_entity_1 = require("../../entities/plugin.entity");
const plugin_hook_entity_1 = require("../../entities/plugin-hook.entity");
const plugin_config_entity_1 = require("../../entities/plugin-config.entity");
const plugin_permission_entity_1 = require("../../entities/plugin-permission.entity");
const event_bus_service_1 = require("./event-bus.service");
let PluginManagerService = PluginManagerService_1 = class PluginManagerService {
    constructor(pluginRepo, pluginHookRepo, pluginConfigRepo, pluginPermissionRepo, eventBus) {
        this.pluginRepo = pluginRepo;
        this.pluginHookRepo = pluginHookRepo;
        this.pluginConfigRepo = pluginConfigRepo;
        this.pluginPermissionRepo = pluginPermissionRepo;
        this.eventBus = eventBus;
        this.logger = new common_1.Logger(PluginManagerService_1.name);
        this.pluginsDir = path.join(process.cwd(), 'plugins');
        this.loadedPlugins = new Map();
    }
    async loadPlugins() {
        const activePlugins = await this.pluginRepo.find({ where: { is_active: 1, is_installed: 1 } });
        this.logger.log(`Loading ${activePlugins.length} active plugins...`);
        for (const plugin of activePlugins) {
            try {
                await this.loadPlugin(plugin);
            }
            catch (error) {
                this.logger.error(`Failed to load plugin ${plugin.slug}:`, error);
            }
        }
        this.logger.log(`Successfully loaded ${this.loadedPlugins.size} plugins`);
    }
    async loadPlugin(plugin) {
        const pluginDir = path.join(this.pluginsDir, plugin.slug);
        if (!fs.existsSync(pluginDir)) {
            this.logger.warn(`Plugin directory not found: ${pluginDir}`);
            return;
        }
        const indexPath = path.join(pluginDir, 'index.js');
        if (!fs.existsSync(indexPath)) {
            this.logger.warn(`Plugin index.js not found: ${indexPath}`);
            return;
        }
        const pluginModule = require(indexPath);
        if (typeof pluginModule.init !== 'function') {
            this.logger.warn(`Plugin ${plugin.slug} does not export an init() function`);
            return;
        }
        const config = plugin.config ? JSON.parse(plugin.config) : {};
        const instance = await pluginModule.init({
            slug: plugin.slug,
            config,
            eventBus: this.eventBus,
        });
        this.loadedPlugins.set(plugin.slug, instance);
        const hooks = await this.pluginHookRepo.find({
            where: { plugin_id: plugin.id, is_active: 1 },
            order: { priority: 'ASC' },
        });
        for (const hook of hooks) {
            const hookFn = instance[hook.hook_name];
            if (typeof hookFn === 'function') {
                this.eventBus.register(hook.hook_name, plugin.slug, hookFn, hook.priority);
            }
        }
        this.logger.log(`Plugin loaded: ${plugin.name} v${plugin.version}`);
    }
    async install(metadata) {
        const existing = await this.pluginRepo.findOne({ where: { slug: metadata.slug } });
        if (existing)
            throw new common_1.BadRequestException('插件已安装');
        if (metadata.dependencies && metadata.dependencies.length > 0) {
            for (const dep of metadata.dependencies) {
                const depPlugin = await this.pluginRepo.findOne({ where: { slug: dep } });
                if (!depPlugin) {
                    throw new common_1.BadRequestException(`缺少依赖: ${dep}`);
                }
            }
        }
        const pluginDir = path.join(this.pluginsDir, metadata.slug);
        if (!fs.existsSync(this.pluginsDir)) {
            fs.mkdirSync(this.pluginsDir, { recursive: true });
        }
        if (!fs.existsSync(pluginDir)) {
            fs.mkdirSync(pluginDir, { recursive: true });
        }
        const plugin = this.pluginRepo.create({
            slug: metadata.slug,
            name: metadata.name,
            version: metadata.version,
            description: metadata.description,
            author: metadata.author,
            is_installed: 1,
            is_active: 0,
            config: JSON.stringify({}),
            dependencies: metadata.dependencies ? JSON.stringify(metadata.dependencies) : undefined,
        });
        const saved = await this.pluginRepo.save([plugin]).then(r => r[0]);
        if (metadata.hooks) {
            for (const hook of metadata.hooks) {
                const pluginHook = this.pluginHookRepo.create({
                    plugin_id: saved.id,
                    hook_name: hook.name,
                    priority: hook.priority || 0,
                    is_active: 1,
                });
                await this.pluginHookRepo.save(pluginHook);
            }
        }
        this.logger.log(`Plugin installed: ${metadata.name} v${metadata.version}`);
        return saved;
    }
    async uninstall(slug) {
        const plugin = await this.pluginRepo.findOne({ where: { slug } });
        if (!plugin)
            throw new common_1.NotFoundException('插件不存在');
        if (this.loadedPlugins.has(slug)) {
            this.eventBus.unregister(slug);
            this.loadedPlugins.delete(slug);
        }
        await this.pluginHookRepo.delete({ plugin_id: plugin.id });
        await this.pluginConfigRepo.delete({ plugin_id: plugin.id });
        await this.pluginPermissionRepo.delete({ plugin_id: plugin.id });
        await this.pluginRepo.delete(plugin.id);
        const pluginDir = path.join(this.pluginsDir, slug);
        if (fs.existsSync(pluginDir)) {
            fs.rmSync(pluginDir, { recursive: true, force: true });
        }
        this.logger.log(`Plugin uninstalled: ${slug}`);
    }
    async enable(slug) {
        const plugin = await this.pluginRepo.findOne({ where: { slug } });
        if (!plugin)
            throw new common_1.NotFoundException('插件不存在');
        if (plugin.is_active)
            throw new common_1.BadRequestException('插件已启用');
        plugin.is_active = 1;
        await this.pluginRepo.save(plugin);
        await this.loadPlugin(plugin);
        this.logger.log(`Plugin enabled: ${slug}`);
    }
    async disable(slug) {
        const plugin = await this.pluginRepo.findOne({ where: { slug } });
        if (!plugin)
            throw new common_1.NotFoundException('插件不存在');
        if (!plugin.is_active)
            throw new common_1.BadRequestException('插件已禁用');
        this.eventBus.unregister(slug);
        this.loadedPlugins.delete(slug);
        plugin.is_active = 0;
        await this.pluginRepo.save(plugin);
        this.logger.log(`Plugin disabled: ${slug}`);
    }
    async configure(slug, config) {
        const plugin = await this.pluginRepo.findOne({ where: { slug } });
        if (!plugin)
            throw new common_1.NotFoundException('插件不存在');
        plugin.config = JSON.stringify(config);
        await this.pluginRepo.save(plugin);
    }
    async getConfig(slug) {
        const plugin = await this.pluginRepo.findOne({ where: { slug } });
        if (!plugin)
            throw new common_1.NotFoundException('插件不存在');
        return plugin.config ? JSON.parse(plugin.config) : {};
    }
    async getPlugins() {
        return this.pluginRepo.find({ order: { created_at: 'DESC' } });
    }
    async getPlugin(slug) {
        const plugin = await this.pluginRepo.findOne({ where: { slug } });
        if (!plugin)
            throw new common_1.NotFoundException('插件不存在');
        return plugin;
    }
    async getPluginHooks(slug) {
        const plugin = await this.pluginRepo.findOne({ where: { slug } });
        if (!plugin)
            throw new common_1.NotFoundException('插件不存在');
        return this.pluginHookRepo.find({ where: { plugin_id: plugin.id } });
    }
    async getPluginConfigs(slug) {
        const plugin = await this.pluginRepo.findOne({ where: { slug } });
        if (!plugin)
            throw new common_1.NotFoundException('插件不存在');
        return this.pluginConfigRepo.find({ where: { plugin_id: plugin.id } });
    }
    async executeHook(hookName, context) {
        return this.eventBus.execute(hookName, context);
    }
};
exports.PluginManagerService = PluginManagerService;
exports.PluginManagerService = PluginManagerService = PluginManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(plugin_entity_1.Plugin)),
    __param(1, (0, typeorm_1.InjectRepository)(plugin_hook_entity_1.PluginHook)),
    __param(2, (0, typeorm_1.InjectRepository)(plugin_config_entity_1.PluginConfig)),
    __param(3, (0, typeorm_1.InjectRepository)(plugin_permission_entity_1.PluginPermission)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        event_bus_service_1.EventBusService])
], PluginManagerService);
//# sourceMappingURL=plugin-manager.service.js.map
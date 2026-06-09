"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var EventBusService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBusService = void 0;
const common_1 = require("@nestjs/common");
let EventBusService = EventBusService_1 = class EventBusService {
    constructor() {
        this.logger = new common_1.Logger(EventBusService_1.name);
        this.hooks = new Map();
    }
    register(hookName, pluginSlug, fn, priority = 0) {
        if (!this.hooks.has(hookName)) {
            this.hooks.set(hookName, []);
        }
        const registrations = this.hooks.get(hookName);
        registrations.push({ pluginSlug, fn, priority });
        registrations.sort((a, b) => a.priority - b.priority);
        this.logger.debug(`Hook registered: ${hookName} (plugin: ${pluginSlug}, priority: ${priority})`);
    }
    unregister(pluginSlug) {
        for (const [hookName, registrations] of this.hooks.entries()) {
            const filtered = registrations.filter(r => r.pluginSlug !== pluginSlug);
            if (filtered.length !== registrations.length) {
                this.hooks.set(hookName, filtered);
                this.logger.debug(`Unregistered ${registrations.length - filtered.length} hook(s) for plugin: ${pluginSlug}`);
            }
        }
    }
    async execute(hookName, context) {
        const registrations = this.hooks.get(hookName) || [];
        let result = context;
        for (const registration of registrations) {
            try {
                const hookResult = await registration.fn(result);
                if (hookResult !== undefined && hookResult !== null) {
                    result = hookResult;
                }
            }
            catch (error) {
                this.logger.error(`Hook execution failed: ${hookName} (plugin: ${registration.pluginSlug})`, error);
            }
        }
        return result;
    }
    getRegisteredHooks() {
        const result = [];
        for (const [hookName, registrations] of this.hooks.entries()) {
            result.push({ hookName, count: registrations.length });
        }
        return result;
    }
    getPluginHooks(pluginSlug) {
        const hookNames = [];
        for (const [hookName, registrations] of this.hooks.entries()) {
            if (registrations.some(r => r.pluginSlug === pluginSlug)) {
                hookNames.push(hookName);
            }
        }
        return hookNames;
    }
    clear() {
        this.hooks.clear();
    }
};
exports.EventBusService = EventBusService;
exports.EventBusService = EventBusService = EventBusService_1 = __decorate([
    (0, common_1.Injectable)()
], EventBusService);
//# sourceMappingURL=event-bus.service.js.map
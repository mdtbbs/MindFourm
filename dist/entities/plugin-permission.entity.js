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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginPermission = void 0;
const typeorm_1 = require("typeorm");
const plugin_entity_1 = require("./plugin.entity");
let PluginPermission = class PluginPermission {
};
exports.PluginPermission = PluginPermission;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], PluginPermission.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", Number)
], PluginPermission.prototype, "plugin_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 100 }),
    __metadata("design:type", String)
], PluginPermission.prototype, "permission", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], PluginPermission.prototype, "granted", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => plugin_entity_1.Plugin, { eager: false }),
    (0, typeorm_1.JoinColumn)({ name: 'plugin_id' }),
    __metadata("design:type", plugin_entity_1.Plugin)
], PluginPermission.prototype, "plugin", void 0);
exports.PluginPermission = PluginPermission = __decorate([
    (0, typeorm_1.Entity)('plugin_permissions')
], PluginPermission);
//# sourceMappingURL=plugin-permission.entity.js.map
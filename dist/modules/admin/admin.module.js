"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const admin_service_1 = require("./admin.service");
const admin_controller_1 = require("./admin.controller");
const stats_module_1 = require("../stats/stats.module");
const settings_module_1 = require("../settings/settings.module");
const logs_module_1 = require("../logs/logs.module");
const bans_module_1 = require("../bans/bans.module");
const categories_module_1 = require("../categories/categories.module");
const tags_module_1 = require("../tags/tags.module");
const index_1 = require("../../entities/index");
let AdminModule = class AdminModule {
};
exports.AdminModule = AdminModule;
exports.AdminModule = AdminModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([index_1.Post, index_1.User, index_1.Category, index_1.Tag, index_1.PostTag, index_1.Ban, index_1.Setting, index_1.OperationLog, index_1.Reply]),
            stats_module_1.StatsModule,
            settings_module_1.SettingsModule,
            logs_module_1.LogsModule,
            bans_module_1.BansModule,
            categories_module_1.CategoriesModule,
            tags_module_1.TagsModule,
        ],
        controllers: [admin_controller_1.AdminController],
        providers: [admin_service_1.AdminService],
    })
], AdminModule);
//# sourceMappingURL=admin.module.js.map
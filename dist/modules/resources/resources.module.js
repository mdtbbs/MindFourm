"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourcesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const resources_service_1 = require("./resources.service");
const resource_categories_service_1 = require("./resource-categories.service");
const resource_versions_service_1 = require("./resource-versions.service");
const resources_controller_1 = require("./resources.controller");
const resource_entity_1 = require("../../entities/resource.entity");
const resource_category_entity_1 = require("../../entities/resource-category.entity");
const resource_version_entity_1 = require("../../entities/resource-version.entity");
const user_entity_1 = require("../../entities/user.entity");
let ResourcesModule = class ResourcesModule {
};
exports.ResourcesModule = ResourcesModule;
exports.ResourcesModule = ResourcesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([resource_entity_1.Resource, resource_category_entity_1.ResourceCategory, resource_version_entity_1.ResourceVersion, user_entity_1.User]),
        ],
        providers: [resources_service_1.ResourcesService, resource_categories_service_1.ResourceCategoryService, resource_versions_service_1.ResourceVersionService],
        controllers: [resources_controller_1.ResourcesController],
        exports: [resources_service_1.ResourcesService, resource_categories_service_1.ResourceCategoryService, resource_versions_service_1.ResourceVersionService],
    })
], ResourcesModule);
//# sourceMappingURL=resources.module.js.map
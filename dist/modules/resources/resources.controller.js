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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourcesController = void 0;
const common_1 = require("@nestjs/common");
const resources_service_1 = require("./resources.service");
const resource_categories_service_1 = require("./resource-categories.service");
const resource_versions_service_1 = require("./resource-versions.service");
const create_resource_dto_1 = require("./dto/create-resource.dto");
const update_resource_dto_1 = require("./dto/update-resource.dto");
const query_resources_dto_1 = require("./dto/query-resources.dto");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
let ResourcesController = class ResourcesController {
    constructor(resourcesService, categoryService, versionService) {
        this.resourcesService = resourcesService;
        this.categoryService = categoryService;
        this.versionService = versionService;
    }
    async getList(query) {
        return this.resourcesService.getList(query);
    }
    async listCategories() {
        return this.categoryService.list();
    }
    async getAdminList(query) {
        return this.resourcesService.getList(query);
    }
    async getById(id) {
        return this.resourcesService.getByIdWithVersions(id);
    }
    async download(id, res) {
        const resource = await this.resourcesService.getById(id);
        await this.resourcesService.incrementDownload(id);
        if (resource.resource_type === 'external' && resource.external_url) {
            return res.redirect(resource.external_url);
        }
        if (!resource.file_path) {
            throw new Error('文件路径不存在');
        }
        const filePath = path.resolve(resource.file_path);
        try {
            await fs.access(filePath);
        }
        catch {
            throw new Error('文件不存在');
        }
        res.set({
            'Content-Type': resource.mime_type || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(resource.file_name || 'file')}"`,
        });
        const file = await fs.readFile(filePath);
        return new common_1.StreamableFile(file);
    }
    async getVersions(id) {
        return this.versionService.list(id);
    }
    async create(dto, req) {
        const userId = req.user.id;
        return this.resourcesService.create(dto, userId);
    }
    async update(id, dto, req) {
        const userId = req.user.id;
        return this.resourcesService.update(id, userId, dto);
    }
    async delete(id, req) {
        const userId = req.user.id;
        await this.resourcesService.delete(id, userId);
        return { success: true, message: '资源删除成功' };
    }
    async addVersion(id, dto, req) {
        const userId = req.user.id;
        const resource = await this.resourcesService.getById(id);
        if (resource.user_id !== userId) {
            throw new Error('无权限添加版本');
        }
        return this.versionService.create({
            resource_id: id,
            version: dto.version,
            file_path: dto.file_path,
        });
    }
    async updateStatus(id, status) {
        return this.resourcesService.updateStatus(id, status);
    }
    async adminDelete(id) {
        await this.resourcesService.adminDelete(id);
        return { success: true, message: '资源删除成功' };
    }
};
exports.ResourcesController = ResourcesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_resources_dto_1.QueryResourcesDto]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "getList", null);
__decorate([
    (0, common_1.Get)('categories'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "listCategories", null);
__decorate([
    (0, common_1.Get)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'moderator'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_resources_dto_1.QueryResourcesDto]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "getAdminList", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "getById", null);
__decorate([
    (0, common_1.Get)(':id/download'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "download", null);
__decorate([
    (0, common_1.Get)(':id/versions'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "getVersions", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_resource_dto_1.CreateResourceDto, Object]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_resource_dto_1.UpdateResourceDto, Object]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)(':id/versions'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object, Object]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "addVersion", null);
__decorate([
    (0, common_1.Put)(':id/status'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'moderator'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Delete)(':id/admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin', 'moderator'),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], ResourcesController.prototype, "adminDelete", null);
exports.ResourcesController = ResourcesController = __decorate([
    (0, common_1.Controller)('resources'),
    __metadata("design:paramtypes", [resources_service_1.ResourcesService,
        resource_categories_service_1.ResourceCategoryService,
        resource_versions_service_1.ResourceVersionService])
], ResourcesController);
//# sourceMappingURL=resources.controller.js.map
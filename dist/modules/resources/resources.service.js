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
exports.ResourcesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const resource_entity_1 = require("../../entities/resource.entity");
const resource_category_entity_1 = require("../../entities/resource-category.entity");
const resource_version_entity_1 = require("../../entities/resource-version.entity");
const user_entity_1 = require("../../entities/user.entity");
const markdown_util_1 = require("../../common/utils/markdown.util");
const cursor_util_1 = require("../../common/utils/cursor.util");
const search_util_1 = require("../../common/utils/search.util");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
let ResourcesService = class ResourcesService {
    constructor(resourceRepository, userRepository, categoryRepository, versionRepository, dataSource) {
        this.resourceRepository = resourceRepository;
        this.userRepository = userRepository;
        this.categoryRepository = categoryRepository;
        this.versionRepository = versionRepository;
        this.dataSource = dataSource;
    }
    async create(dto, userId) {
        return this.dataSource.transaction(async (manager) => {
            if (dto.category_id) {
                const category = await manager.findOne(resource_category_entity_1.ResourceCategory, {
                    where: { id: dto.category_id },
                });
                if (!category) {
                    throw new common_1.BadRequestException('分类不存在');
                }
            }
            if (!['upload', 'external'].includes(dto.resource_type)) {
                throw new common_1.BadRequestException('无效的资源类型');
            }
            const contentHtml = dto.content ? (0, markdown_util_1.parseMarkdown)(dto.content) : undefined;
            const newResource = manager.create(resource_entity_1.Resource, {
                user_id: userId,
                title: dto.title,
                description: dto.description,
                resource_type: dto.resource_type,
                external_url: dto.external_url,
                version: dto.version,
                content: dto.content,
                content_html: contentHtml,
                category_id: dto.category_id,
                is_public: dto.is_public !== undefined ? dto.is_public : 0,
                status: 'pending',
                download_count: 0,
            });
            const savedResource = await manager.save(newResource);
            const result = await manager.findOne(resource_entity_1.Resource, {
                where: { id: savedResource.id },
                relations: ['user', 'category'],
            });
            return result;
        });
    }
    async getList(query) {
        const { limit = 20, category_id, search, status = 'approved', sort = 'created_at', cursor, } = query;
        const where = {};
        if (category_id) {
            where.category_id = category_id;
        }
        if (status) {
            where.status = status;
        }
        if (search) {
            where.title = (0, typeorm_2.Like)(`%${(0, search_util_1.escapeLike)(search)}%`);
        }
        let cursorCondition = {};
        if (cursor) {
            try {
                const decoded = (0, cursor_util_1.decodeCursor)(cursor);
                const cursorValue = sort === 'created_at' ? new Date(parseInt(decoded[0])) : parseInt(decoded[0]);
                const idValue = parseInt(decoded[1]);
                cursorCondition = [
                    { [sort]: (0, typeorm_2.LessThan)(cursorValue) },
                    { [sort]: cursorValue, id: (0, typeorm_2.LessThan)(idValue) },
                ];
            }
            catch (e) {
            }
        }
        const resources = await this.resourceRepository.find({
            where: cursorCondition.length > 0
                ? [{ ...where, ...cursorCondition[0] }, { ...where, ...cursorCondition[1] }]
                : where,
            relations: ['user', 'category'],
            select: {
                id: true,
                user_id: true,
                category_id: true,
                title: true,
                description: true,
                resource_type: true,
                file_name: true,
                file_path: true,
                file_size: true,
                mime_type: true,
                external_url: true,
                version: true,
                content: true,
                status: true,
                is_public: true,
                download_count: true,
                created_at: true,
                updated_at: true,
            },
            order: {
                [sort]: 'DESC',
                id: 'DESC',
            },
            take: limit + 1,
        });
        const hasMore = resources.length > limit;
        if (hasMore) {
            resources.pop();
        }
        let nextCursor = null;
        if (hasMore && resources.length > 0) {
            const lastResource = resources[resources.length - 1];
            const cursorValue = sort === 'created_at'
                ? lastResource.created_at.getTime().toString()
                : lastResource[sort].toString();
            nextCursor = (0, cursor_util_1.encodeCursor)(cursorValue, lastResource.id.toString());
        }
        return {
            data: resources,
            nextCursor,
            hasMore,
        };
    }
    async getById(id) {
        const resource = await this.resourceRepository.findOne({
            where: { id },
            relations: ['user', 'category'],
        });
        if (!resource) {
            throw new common_1.NotFoundException('资源不存在');
        }
        return resource;
    }
    async getByIdWithVersions(id) {
        const resource = await this.getById(id);
        const versions = await this.versionRepository.find({
            where: { resource_id: id },
            order: { created_at: 'DESC' },
        });
        return {
            ...resource,
            versions,
        };
    }
    async incrementDownload(id) {
        await this.resourceRepository.increment({ id }, 'download_count', 1);
    }
    async getByUserId(userId, limit = 20, cursor) {
        const where = { user_id: userId };
        let cursorCondition = {};
        if (cursor) {
            try {
                const decoded = (0, cursor_util_1.decodeCursor)(cursor);
                const cursorValue = new Date(parseInt(decoded[0]));
                const idValue = parseInt(decoded[1]);
                cursorCondition = [
                    { created_at: (0, typeorm_2.LessThan)(cursorValue) },
                    { created_at: cursorValue, id: (0, typeorm_2.LessThan)(idValue) },
                ];
            }
            catch (e) {
            }
        }
        const resources = await this.resourceRepository.find({
            where: cursorCondition.length > 0
                ? [{ ...where, ...cursorCondition[0] }, { ...where, ...cursorCondition[1] }]
                : where,
            relations: ['user', 'category'],
            order: {
                created_at: 'DESC',
                id: 'DESC',
            },
            take: limit + 1,
        });
        const hasMore = resources.length > limit;
        if (hasMore) {
            resources.pop();
        }
        let nextCursor = null;
        if (hasMore && resources.length > 0) {
            const lastResource = resources[resources.length - 1];
            const cursorValue = lastResource.created_at.getTime().toString();
            nextCursor = (0, cursor_util_1.encodeCursor)(cursorValue, lastResource.id.toString());
        }
        return {
            data: resources,
            nextCursor,
            hasMore,
        };
    }
    async update(id, userId, dto) {
        return this.dataSource.transaction(async (manager) => {
            const resource = await manager.findOne(resource_entity_1.Resource, {
                where: { id },
                relations: ['user'],
            });
            if (!resource) {
                throw new common_1.NotFoundException('资源不存在');
            }
            if (resource.user_id !== userId) {
                throw new common_1.ForbiddenException('无权限编辑此资源');
            }
            if (dto.category_id && dto.category_id !== resource.category_id) {
                const category = await manager.findOne(resource_category_entity_1.ResourceCategory, {
                    where: { id: dto.category_id },
                });
                if (!category) {
                    throw new common_1.BadRequestException('分类不存在');
                }
            }
            const updateData = {};
            if (dto.title)
                updateData.title = dto.title;
            if (dto.description !== undefined)
                updateData.description = dto.description;
            if (dto.resource_type) {
                if (!['upload', 'external'].includes(dto.resource_type)) {
                    throw new common_1.BadRequestException('无效的资源类型');
                }
                updateData.resource_type = dto.resource_type;
            }
            if (dto.external_url !== undefined)
                updateData.external_url = dto.external_url;
            if (dto.version !== undefined)
                updateData.version = dto.version;
            if (dto.content !== undefined) {
                updateData.content = dto.content;
                updateData.content_html = (0, markdown_util_1.parseMarkdown)(dto.content);
            }
            if (dto.category_id !== undefined)
                updateData.category_id = dto.category_id;
            if (dto.is_public !== undefined)
                updateData.is_public = dto.is_public;
            await manager.update(resource_entity_1.Resource, id, updateData);
            const result = await manager.findOne(resource_entity_1.Resource, {
                where: { id },
                relations: ['user', 'category'],
            });
            return result;
        });
    }
    async delete(id, userId) {
        const resource = await this.resourceRepository.findOne({
            where: { id },
            relations: ['user'],
        });
        if (!resource) {
            throw new common_1.NotFoundException('资源不存在');
        }
        if (resource.user_id !== userId) {
            throw new common_1.ForbiddenException('无权限删除此资源');
        }
        if (resource.resource_type === 'upload' && resource.file_path) {
            try {
                const filePath = path.resolve(resource.file_path);
                await fs.unlink(filePath);
            }
            catch (err) {
                console.warn(`File not found: ${resource.file_path}`);
            }
        }
        await this.versionRepository.delete({ resource_id: id });
        await this.resourceRepository.delete(id);
    }
    async adminDelete(id) {
        const resource = await this.resourceRepository.findOne({
            where: { id },
        });
        if (!resource) {
            throw new common_1.NotFoundException('资源不存在');
        }
        if (resource.resource_type === 'upload' && resource.file_path) {
            try {
                const filePath = path.resolve(resource.file_path);
                await fs.unlink(filePath);
            }
            catch (err) {
                console.warn(`File not found: ${resource.file_path}`);
            }
        }
        await this.versionRepository.delete({ resource_id: id });
        await this.resourceRepository.delete(id);
    }
    async updateStatus(id, status) {
        const validStatuses = ['pending', 'approved', 'rejected'];
        if (!validStatuses.includes(status)) {
            throw new common_1.BadRequestException('无效的状态');
        }
        await this.resourceRepository.update(id, { status });
        const resource = await this.resourceRepository.findOne({
            where: { id },
            relations: ['user', 'category'],
        });
        if (!resource) {
            throw new common_1.NotFoundException('资源不存在');
        }
        return resource;
    }
    async countByStatus(status) {
        return this.resourceRepository.count({
            where: { status },
        });
    }
};
exports.ResourcesService = ResourcesService;
exports.ResourcesService = ResourcesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(resource_entity_1.Resource)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(2, (0, typeorm_1.InjectRepository)(resource_category_entity_1.ResourceCategory)),
    __param(3, (0, typeorm_1.InjectRepository)(resource_version_entity_1.ResourceVersion)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], ResourcesService);
//# sourceMappingURL=resources.service.js.map
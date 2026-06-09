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
exports.ResourceCategoryService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const resource_category_entity_1 = require("../../entities/resource-category.entity");
let ResourceCategoryService = class ResourceCategoryService {
    constructor(categoryRepository, dataSource) {
        this.categoryRepository = categoryRepository;
        this.dataSource = dataSource;
    }
    async list(includeInactive = false) {
        const where = {};
        if (!includeInactive) {
            where.is_active = 1;
        }
        return this.categoryRepository.find({
            where,
            order: { sort_order: 'ASC' },
        });
    }
    async getById(id) {
        const category = await this.categoryRepository.findOne({
            where: { id },
        });
        if (!category) {
            throw new common_1.NotFoundException('分类不存在');
        }
        return category;
    }
    async create(dto) {
        const existing = await this.categoryRepository.findOne({
            where: { slug: dto.slug },
        });
        if (existing) {
            throw new common_1.BadRequestException('Slug已存在');
        }
        const category = this.categoryRepository.create(dto);
        return this.categoryRepository.save(category);
    }
    async update(id, dto) {
        const category = await this.getById(id);
        if (!category)
            return null;
        if (dto.slug && dto.slug !== category.slug) {
            const existing = await this.categoryRepository.findOne({
                where: { slug: dto.slug },
            });
            if (existing) {
                throw new common_1.BadRequestException('Slug已存在');
            }
        }
        await this.categoryRepository.update(id, dto);
        return this.categoryRepository.findOne({ where: { id } });
    }
    async delete(id) {
        const category = await this.categoryRepository.findOne({
            where: { id },
        });
        if (!category) {
            throw new common_1.NotFoundException('分类不存在');
        }
        const resourceCount = await this.categoryRepository.manager.count('resources', {
            where: { category_id: id },
        });
        if (resourceCount > 0) {
            throw new common_1.BadRequestException('该分类下还有资源，无法删除');
        }
        await this.categoryRepository.delete(id);
    }
};
exports.ResourceCategoryService = ResourceCategoryService;
exports.ResourceCategoryService = ResourceCategoryService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(resource_category_entity_1.ResourceCategory)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.DataSource])
], ResourceCategoryService);
//# sourceMappingURL=resource-categories.service.js.map
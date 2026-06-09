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
exports.CategoriesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const category_entity_1 = require("../../entities/category.entity");
const post_entity_1 = require("../../entities/post.entity");
let CategoriesService = class CategoriesService {
    constructor(categoryRepository, postRepository) {
        this.categoryRepository = categoryRepository;
        this.postRepository = postRepository;
    }
    async getAll() {
        const categories = await this.categoryRepository
            .createQueryBuilder('category')
            .leftJoin('category.posts', 'post')
            .addSelect('COUNT(post.id)', 'post_count')
            .groupBy('category.id')
            .orderBy('category.sort_order', 'ASC')
            .addOrderBy('category.created_at', 'ASC')
            .getRawMany();
        return categories.map((row) => ({
            id: row.category_id,
            name: row.category_name,
            slug: row.category_slug,
            sort_order: row.category_sort_order,
            is_active: row.category_is_active,
            created_at: row.category_created_at,
            post_count: parseInt(row.post_count, 10),
        }));
    }
    async getById(id) {
        const category = await this.categoryRepository.findOne({ where: { id } });
        if (!category) {
            throw new common_1.NotFoundException(`Category with ID ${id} not found`);
        }
        return category;
    }
    async getBySlug(slug) {
        const category = await this.categoryRepository.findOne({ where: { slug } });
        if (!category) {
            throw new common_1.NotFoundException(`Category with slug "${slug}" not found`);
        }
        return category;
    }
    async create(dto) {
        const category = this.categoryRepository.create({
            name: dto.name,
            slug: dto.slug,
            sort_order: dto.sort_order ?? 0,
            is_active: 1,
        });
        return this.categoryRepository.save(category);
    }
    async update(id, dto) {
        const category = await this.getById(id);
        if (dto.name !== undefined)
            category.name = dto.name;
        if (dto.slug !== undefined)
            category.slug = dto.slug;
        if (dto.sort_order !== undefined)
            category.sort_order = dto.sort_order;
        if (dto.is_active !== undefined)
            category.is_active = dto.is_active;
        return this.categoryRepository.save(category);
    }
    async delete(id) {
        const category = await this.getById(id);
        await this.categoryRepository.remove(category);
        return { message: 'Category deleted successfully' };
    }
};
exports.CategoriesService = CategoriesService;
exports.CategoriesService = CategoriesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(category_entity_1.Category)),
    __param(1, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], CategoriesService);
//# sourceMappingURL=categories.service.js.map
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
exports.TagsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const tag_entity_1 = require("../../entities/tag.entity");
const post_entity_1 = require("../../entities/post.entity");
const post_tag_entity_1 = require("../../entities/post-tag.entity");
let TagsService = class TagsService {
    constructor(tagRepository, postRepository, postTagRepository) {
        this.tagRepository = tagRepository;
        this.postRepository = postRepository;
        this.postTagRepository = postTagRepository;
    }
    async getAll() {
        const tags = await this.tagRepository
            .createQueryBuilder('tag')
            .leftJoin('tag.postTags', 'post_tag')
            .addSelect('COUNT(post_tag.post_id)', 'post_count')
            .groupBy('tag.id')
            .orderBy('tag.created_at', 'DESC')
            .getRawMany();
        return tags.map((row) => ({
            id: row.tag_id,
            name: row.tag_name,
            slug: row.tag_slug,
            created_at: row.tag_created_at,
            post_count: parseInt(row.post_count, 10),
        }));
    }
    async getBySlug(slug) {
        const tag = await this.tagRepository.findOne({
            where: { slug },
        });
        if (!tag) {
            throw new common_1.NotFoundException(`Tag with slug "${slug}" not found`);
        }
        return tag;
    }
    async getOrCreate(name) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        let tag = await this.tagRepository.findOne({
            where: { slug },
        });
        if (!tag) {
            tag = this.tagRepository.create({
                name,
                slug,
            });
            tag = await this.tagRepository.save(tag);
        }
        return tag;
    }
    async attachTags(postId, tagNames) {
        const tags = await Promise.all(tagNames.map((name) => this.getOrCreate(name)));
        for (const tag of tags) {
            await this.postTagRepository.query('INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)', [postId, tag.id]);
        }
        return tags;
    }
    async batchAttach(postId, tagIds) {
        for (const tagId of tagIds) {
            await this.postTagRepository.query('INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)', [postId, tagId]);
        }
    }
    async detachTags(postId) {
        await this.postTagRepository.delete({ post: { id: postId } });
    }
    async getPostTags(postId) {
        const postTags = await this.postTagRepository.find({
            where: { post: { id: postId } },
            relations: ['tag'],
        });
        return postTags.map((pt) => pt.tag);
    }
    async getPostTagsForMultiplePosts(postIds) {
        const postTags = await this.postTagRepository.find({
            where: postIds.map((id) => ({ post: { id } })),
            relations: ['tag'],
        });
        const result = {};
        for (const postId of postIds) {
            result[postId] = postTags
                .filter((pt) => pt.post.id === postId)
                .map((pt) => pt.tag);
        }
        return result;
    }
    async getPostsByTagSlug(slug, page, limit) {
        const tag = await this.getBySlug(slug);
        const [posts, total] = await this.postRepository
            .createQueryBuilder('post')
            .innerJoin('post.postTags', 'post_tag')
            .innerJoin('post_tag.tag', 'tag')
            .where('tag.id = :tagId', { tagId: tag.id })
            .skip((page - 1) * limit)
            .take(limit)
            .orderBy('post.created_at', 'DESC')
            .getManyAndCount();
        return {
            posts,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async findAll(page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [data, total] = await this.tagRepository.findAndCount({
            order: { created_at: 'DESC' },
            skip,
            take: limit,
        });
        const totalPages = Math.ceil(total / limit);
        return {
            data,
            total,
            page,
            limit,
            totalPages,
        };
    }
    async create(dto) {
        const slug = dto.slug || dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const tag = this.tagRepository.create({
            name: dto.name,
            slug,
        });
        const saved = await this.tagRepository.save(tag);
        return saved;
    }
    async update(id, dto) {
        const tag = await this.tagRepository.findOne({
            where: { id },
        });
        if (!tag) {
            throw new common_1.NotFoundException(`Tag with ID ${id} not found`);
        }
        if (dto.name !== undefined) {
            tag.name = dto.name;
        }
        if (dto.slug !== undefined) {
            tag.slug = dto.slug;
        }
        return await this.tagRepository.save(tag);
    }
    async delete(id) {
        const tag = await this.tagRepository.findOne({
            where: { id },
        });
        if (!tag) {
            throw new common_1.NotFoundException(`Tag with ID ${id} not found`);
        }
        await this.tagRepository.remove(tag);
        return { message: 'Tag deleted successfully' };
    }
};
exports.TagsService = TagsService;
exports.TagsService = TagsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(tag_entity_1.Tag)),
    __param(1, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __param(2, (0, typeorm_1.InjectRepository)(post_tag_entity_1.PostTag)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], TagsService);
//# sourceMappingURL=tags.service.js.map
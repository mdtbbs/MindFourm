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
exports.BookmarksService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bookmark_entity_1 = require("../../entities/bookmark.entity");
const post_entity_1 = require("../../entities/post.entity");
const user_entity_1 = require("../../entities/user.entity");
const category_entity_1 = require("../../entities/category.entity");
let BookmarksService = class BookmarksService {
    constructor(bookmarkRepository, postRepository, userRepository, categoryRepository) {
        this.bookmarkRepository = bookmarkRepository;
        this.postRepository = postRepository;
        this.userRepository = userRepository;
        this.categoryRepository = categoryRepository;
    }
    async add(userId, postId) {
        const existing = await this.bookmarkRepository.findOne({
            where: { user_id: userId, post_id: postId },
        });
        if (existing) {
            return existing;
        }
        const post = await this.postRepository.findOne({ where: { id: postId } });
        if (!post) {
            throw new common_1.NotFoundException(`Post with id ${postId} not found`);
        }
        const bookmark = this.bookmarkRepository.create({
            user_id: userId,
            post_id: postId,
        });
        return this.bookmarkRepository.save(bookmark);
    }
    async remove(userId, postId) {
        const result = await this.bookmarkRepository.delete({
            user_id: userId,
            post_id: postId,
        });
        if (result.affected === 0) {
            throw new common_1.NotFoundException('Bookmark not found');
        }
    }
    async check(userId, postId) {
        const count = await this.bookmarkRepository.count({
            where: { user_id: userId, post_id: postId },
        });
        return count > 0;
    }
    async getByUserId(userId, page = 1, limit = 20) {
        const [bookmarks, total] = await this.bookmarkRepository.findAndCount({
            where: { user_id: userId },
            relations: ['post', 'post.category', 'post.user'],
            order: { created_at: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return { bookmarks, total };
    }
};
exports.BookmarksService = BookmarksService;
exports.BookmarksService = BookmarksService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(bookmark_entity_1.Bookmark)),
    __param(1, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(3, (0, typeorm_1.InjectRepository)(category_entity_1.Category)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], BookmarksService);
//# sourceMappingURL=bookmarks.service.js.map
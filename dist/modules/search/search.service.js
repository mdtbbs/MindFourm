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
exports.SearchService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const post_entity_1 = require("../../entities/post.entity");
const user_entity_1 = require("../../entities/user.entity");
const search_history_entity_1 = require("../../entities/search-history.entity");
const popular_search_entity_1 = require("../../entities/popular-search.entity");
const redis_service_1 = require("../../database/redis.service");
const search_util_1 = require("../../common/utils/search.util");
let SearchService = class SearchService {
    constructor(postRepository, userRepository, searchHistoryRepo, popularSearchRepo, redisService) {
        this.postRepository = postRepository;
        this.userRepository = userRepository;
        this.searchHistoryRepo = searchHistoryRepo;
        this.popularSearchRepo = popularSearchRepo;
        this.redisService = redisService;
    }
    async searchPosts(query, options) {
        const page = options.page || 1;
        const limit = Math.min(options.limit || 20, 50);
        const qb = this.postRepository
            .createQueryBuilder('p')
            .leftJoinAndSelect('p.user', 'user')
            .leftJoinAndSelect('p.category', 'category')
            .where('p.status = :status', { status: 'published' })
            .andWhere('(p.title LIKE :query OR p.content LIKE :query)', { query: `%${(0, search_util_1.escapeLike)(query)}%` });
        if (options.category) {
            qb.andWhere('category.slug = :category', { category: options.category });
        }
        if (options.sort === 'relevance') {
            qb.orderBy('CASE WHEN p.title LIKE :query THEN 1 ELSE 0 END', 'DESC');
            qb.addOrderBy('p.created_at', 'DESC');
        }
        else if (options.sort === 'oldest') {
            qb.orderBy('p.created_at', 'ASC');
        }
        else {
            qb.orderBy('p.created_at', 'DESC');
        }
        qb.skip((page - 1) * limit).take(limit);
        const [posts, total] = await qb.getManyAndCount();
        return {
            data: posts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async searchUsers(query, limit = 20) {
        return this.userRepository.find({
            where: [
                { username: (0, typeorm_2.Like)(`%${(0, search_util_1.escapeLike)(query)}%`) },
                { bio: (0, typeorm_2.Like)(`%${(0, search_util_1.escapeLike)(query)}%`) },
            ],
            take: limit,
            select: ['id', 'username', 'avatar_url', 'bio'],
        });
    }
    async recordSearch(userId, query, resultsCount) {
        this.searchHistoryRepo.save({
            user_id: userId,
            query: query.toLowerCase().trim(),
            search_type: 'global',
            results_count: resultsCount,
        }).catch(() => { });
        this.redisService.zIncrBy('search:popular', 1, query.toLowerCase().trim())
            .catch(() => { });
    }
    async getPopularSearches(limit = 10) {
        const cached = await this.redisService.get('search:popular:cached');
        if (cached) {
            return JSON.parse(cached);
        }
        const popular = await this.redisService.zRevRange('search:popular', 0, limit - 1);
        this.redisService.set('search:popular:cached', JSON.stringify(popular), 300)
            .catch(() => { });
        return popular;
    }
    async getSearchHistory(userId, limit = 10) {
        return this.searchHistoryRepo.find({
            where: { user_id: userId },
            order: { created_at: 'DESC' },
            take: limit,
        });
    }
    async clearSearchHistory(userId) {
        await this.searchHistoryRepo.delete({ user_id: userId });
    }
};
exports.SearchService = SearchService;
exports.SearchService = SearchService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(2, (0, typeorm_1.InjectRepository)(search_history_entity_1.SearchHistory)),
    __param(3, (0, typeorm_1.InjectRepository)(popular_search_entity_1.PopularSearch)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        redis_service_1.RedisService])
], SearchService);
//# sourceMappingURL=search.service.js.map
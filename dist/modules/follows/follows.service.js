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
exports.FollowsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const follow_entity_1 = require("../../entities/follow.entity");
const user_entity_1 = require("../../entities/user.entity");
let FollowsService = class FollowsService {
    constructor(followRepo, userRepo, dataSource) {
        this.followRepo = followRepo;
        this.userRepo = userRepo;
        this.dataSource = dataSource;
    }
    async followUser(followerId, followingId) {
        if (followerId === followingId) {
            throw new common_1.BadRequestException('不能关注自己');
        }
        const user = await this.userRepo.findOne({ where: { id: followingId } });
        if (!user)
            throw new common_1.NotFoundException('用户不存在');
        const existing = await this.followRepo.findOne({
            where: { follower_id: followerId, following_id: followingId },
        });
        if (existing)
            throw new common_1.BadRequestException('已关注该用户');
        const follow = this.followRepo.create({ follower_id: followerId, following_id: followingId });
        return this.followRepo.save(follow);
    }
    async unfollowUser(followerId, followingId) {
        const result = await this.followRepo.delete({
            follower_id: followerId,
            following_id: followingId,
        });
        if (result.affected === 0)
            throw new common_1.BadRequestException('未关注该用户');
    }
    async checkFollowStatus(followerId, followingId) {
        const follow = await this.followRepo.findOne({
            where: { follower_id: followerId, following_id: followingId },
        });
        return !!follow;
    }
    async getFollowers(userId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const cappedLimit = Math.min(limit, 50);
        const [follows, total] = await this.followRepo.findAndCount({
            where: { following_id: userId },
            relations: ['follower'],
            order: { created_at: 'DESC' },
            skip,
            take: cappedLimit,
        });
        return {
            users: follows.map(f => f.follower),
            total,
            page,
            limit: cappedLimit,
            totalPages: Math.ceil(total / cappedLimit),
        };
    }
    async getFollowing(userId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const cappedLimit = Math.min(limit, 50);
        const [follows, total] = await this.followRepo.findAndCount({
            where: { follower_id: userId },
            relations: ['following'],
            order: { created_at: 'DESC' },
            skip,
            take: cappedLimit,
        });
        return {
            users: follows.map(f => f.following),
            total,
            page,
            limit: cappedLimit,
            totalPages: Math.ceil(total / cappedLimit),
        };
    }
    async getFollowCounts(userId) {
        const [followers, following] = await Promise.all([
            this.followRepo.count({ where: { following_id: userId } }),
            this.followRepo.count({ where: { follower_id: userId } }),
        ]);
        return { followers, following };
    }
};
exports.FollowsService = FollowsService;
exports.FollowsService = FollowsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(follow_entity_1.Follow)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], FollowsService);
//# sourceMappingURL=follows.service.js.map
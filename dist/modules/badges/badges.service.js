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
exports.BadgesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const badge_entity_1 = require("../../entities/badge.entity");
const user_badge_entity_1 = require("../../entities/user-badge.entity");
const user_entity_1 = require("../../entities/user.entity");
let BadgesService = class BadgesService {
    constructor(badgeRepo, userBadgeRepo, userRepo) {
        this.badgeRepo = badgeRepo;
        this.userBadgeRepo = userBadgeRepo;
        this.userRepo = userRepo;
    }
    async getAllBadges() {
        return this.badgeRepo.find({ where: { is_active: 1 }, order: { level: 'ASC' } });
    }
    async getUserBadges(userId) {
        return this.userBadgeRepo.find({
            where: { user_id: userId },
            relations: ['badge'],
            order: { granted_at: 'DESC' },
        });
    }
    async awardBadge(userId, badgeId, grantedBy) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const badge = await this.badgeRepo.findOne({ where: { id: badgeId } });
        if (!badge)
            throw new common_1.NotFoundException('Badge not found');
        const existing = await this.userBadgeRepo.findOne({
            where: { user_id: userId, badge_id: badgeId },
        });
        if (existing)
            throw new common_1.BadRequestException('用户已获得此徽章');
        const userBadge = this.userBadgeRepo.create({
            user_id: userId,
            badge_id: badgeId,
            granted_by: grantedBy,
        });
        return this.userBadgeRepo.save([userBadge]).then(r => r[0]);
    }
    async removeUserBadge(userId, badgeId) {
        const result = await this.userBadgeRepo.delete({ user_id: userId, badge_id: badgeId });
        if (result.affected === 0)
            throw new common_1.NotFoundException('徽章记录不存在');
    }
    async adminGetAllBadges() {
        return this.badgeRepo.find({ order: { created_at: 'DESC' } });
    }
    async adminCreateBadge(data) {
        const badge = this.badgeRepo.create(data);
        return this.badgeRepo.save(badge);
    }
    async adminUpdateBadge(id, data) {
        const badge = await this.badgeRepo.findOne({ where: { id } });
        if (!badge)
            throw new common_1.NotFoundException('徽章不存在');
        Object.assign(badge, data);
        return this.badgeRepo.save(badge);
    }
    async adminDeleteBadge(id) {
        const result = await this.badgeRepo.delete(id);
        if (result.affected === 0)
            throw new common_1.NotFoundException('徽章不存在');
    }
    async initializeDefaultBadges() {
        const existing = await this.badgeRepo.count();
        if (existing > 0)
            return;
        const defaults = [
            { name: '初来乍到', slug: 'first-post', icon: '🎉', description: '发布第一篇帖子', level: 'bronze', criteria: '{"type":"post_count","value":1}', is_active: 1 },
            { name: '笔耕不辍', slug: 'prolific-writer', icon: '✍️', description: '发布50篇帖子', level: 'silver', criteria: '{"type":"post_count","value":50}', is_active: 1 },
            { name: '人气之星', slug: 'popular', icon: '⭐', description: '收到100个赞', level: 'gold', criteria: '{"type":"like_count","value":100}', is_active: 1 },
            { name: '社区元老', slug: 'veteran', icon: '🏆', description: '活跃365天', level: 'platinum', criteria: '{"type":"active_days","value":365}', is_active: 1 },
        ];
        for (const d of defaults) {
            await this.badgeRepo.save(this.badgeRepo.create(d));
        }
    }
};
exports.BadgesService = BadgesService;
exports.BadgesService = BadgesService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(badge_entity_1.Badge)),
    __param(1, (0, typeorm_1.InjectRepository)(user_badge_entity_1.UserBadge)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], BadgesService);
//# sourceMappingURL=badges.service.js.map
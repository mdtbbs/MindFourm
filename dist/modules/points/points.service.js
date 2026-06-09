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
exports.PointsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const point_log_entity_1 = require("../../entities/point-log.entity");
const point_rule_entity_1 = require("../../entities/point-rule.entity");
const user_entity_1 = require("../../entities/user.entity");
const cursor_util_1 = require("../../common/utils/cursor.util");
let PointsService = class PointsService {
    constructor(pointLogRepo, pointRuleRepo, userRepo, dataSource) {
        this.pointLogRepo = pointLogRepo;
        this.pointRuleRepo = pointRuleRepo;
        this.userRepo = userRepo;
        this.dataSource = dataSource;
    }
    async awardPoints(userId, action, targetType, targetId) {
        const rule = await this.pointRuleRepo.findOne({
            where: { action, is_active: 1 },
        });
        if (!rule) {
            return null;
        }
        if (rule.points <= 0) {
            return null;
        }
        return this.dataSource.transaction(async (manager) => {
            await manager.increment(user_entity_1.User, { id: userId }, 'total_points', rule.points);
            await manager.increment(user_entity_1.User, { id: userId }, 'available_points', rule.points);
            const log = new point_log_entity_1.PointLog();
            log.user_id = userId;
            log.action = action;
            log.points_change = rule.points;
            log.target_type = targetType;
            log.target_id = targetId;
            await manager.save(point_log_entity_1.PointLog, log);
            return log;
        });
    }
    async deductPoints(userId, amount, reason) {
        return this.dataSource.transaction(async (manager) => {
            const user = await manager.findOne(user_entity_1.User, { where: { id: userId } });
            if (!user) {
                throw new common_1.NotFoundException('User not found');
            }
            if (user.available_points < amount) {
                throw new common_1.BadRequestException('积分不足');
            }
            await manager.decrement(user_entity_1.User, { id: userId }, 'available_points', amount);
            const log = new point_log_entity_1.PointLog();
            log.user_id = userId;
            log.action = reason;
            log.points_change = -amount;
            log.target_type = undefined;
            log.target_id = undefined;
            await manager.save(point_log_entity_1.PointLog, log);
            return log;
        });
    }
    async awardPointsManual(userId, amount, reason) {
        return this.dataSource.transaction(async (manager) => {
            await manager.increment(user_entity_1.User, { id: userId }, 'total_points', amount);
            await manager.increment(user_entity_1.User, { id: userId }, 'available_points', amount);
            const log = new point_log_entity_1.PointLog();
            log.user_id = userId;
            log.action = reason;
            log.points_change = amount;
            log.target_type = 'admin_award';
            log.target_id = undefined;
            await manager.save(point_log_entity_1.PointLog, log);
            return log;
        });
    }
    async getUserPoints(userId) {
        const user = await this.userRepo.findOne({
            where: { id: userId },
            select: ['total_points', 'available_points'],
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return {
            total_points: user.total_points,
            available_points: user.available_points,
        };
    }
    async getHistory(userId, limit = 20, cursor) {
        const cappedLimit = Math.min(limit, 50);
        const query = this.pointLogRepo.createQueryBuilder('pl')
            .where('pl.user_id = :userId', { userId })
            .orderBy('pl.id', 'DESC')
            .take(cappedLimit + 1);
        if (cursor) {
            const decoded = (0, cursor_util_1.decodeCursor)(cursor);
            query.andWhere('pl.id < :cursorId', { cursorId: decoded });
        }
        const logs = await query.getMany();
        const hasMore = logs.length > cappedLimit;
        if (hasMore) {
            logs.pop();
        }
        const nextCursor = hasMore && logs.length > 0
            ? (0, cursor_util_1.encodeCursor)(logs[logs.length - 1].id)
            : null;
        return { logs, nextCursor };
    }
    async getLeaderboard(limit = 20, page = 1) {
        const cappedLimit = Math.min(limit, 50);
        const offset = (page - 1) * cappedLimit;
        const [users, total] = await this.userRepo
            .createQueryBuilder('u')
            .select(['u.id', 'u.username', 'u.avatar_url', 'u.total_points'])
            .orderBy('u.total_points', 'DESC')
            .addOrderBy('u.created_at', 'ASC')
            .skip(offset)
            .take(cappedLimit)
            .getManyAndCount();
        const rankedUsers = users.map((user, index) => ({
            ...user,
            rank: offset + index + 1,
        }));
        return { users: rankedUsers, total };
    }
    async getRules() {
        return this.pointRuleRepo.find({
            order: { action: 'ASC' },
        });
    }
    async createRule(dto) {
        const existing = await this.pointRuleRepo.findOne({
            where: { action: dto.action },
        });
        if (existing) {
            throw new common_1.ConflictException('积分规则已存在');
        }
        const rule = this.pointRuleRepo.create(dto);
        return this.pointRuleRepo.save(rule);
    }
    async updateRule(id, dto) {
        const rule = await this.pointRuleRepo.findOne({ where: { id } });
        if (!rule) {
            throw new common_1.NotFoundException('积分规则不存在');
        }
        Object.assign(rule, dto);
        return this.pointRuleRepo.save(rule);
    }
    async deleteRule(id) {
        const result = await this.pointRuleRepo.delete(id);
        if (result.affected === 0) {
            throw new common_1.NotFoundException('积分规则不存在');
        }
    }
    async initializeDefaultRules() {
        const existing = await this.pointRuleRepo.count();
        if (existing > 0) {
            return;
        }
        const defaultRules = [
            { action: 'create_post', points: 10, description: '发布帖子', is_active: 1 },
            { action: 'create_reply', points: 5, description: '发布回复', is_active: 1 },
            { action: 'receive_like', points: 2, description: '收到点赞', is_active: 1 },
            { action: 'daily_login', points: 1, description: '每日登录', is_active: 1 },
        ];
        for (const rule of defaultRules) {
            const newRule = this.pointRuleRepo.create(rule);
            await this.pointRuleRepo.save(newRule);
        }
    }
};
exports.PointsService = PointsService;
exports.PointsService = PointsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(point_log_entity_1.PointLog)),
    __param(1, (0, typeorm_1.InjectRepository)(point_rule_entity_1.PointRule)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], PointsService);
//# sourceMappingURL=points.service.js.map
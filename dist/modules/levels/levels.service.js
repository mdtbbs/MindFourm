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
exports.LevelsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const level_entity_1 = require("../../entities/level.entity");
const user_entity_1 = require("../../entities/user.entity");
let LevelsService = class LevelsService {
    constructor(levelRepo, userRepo) {
        this.levelRepo = levelRepo;
        this.userRepo = userRepo;
    }
    async getAllLevels() {
        return this.levelRepo.find({ order: { sort_order: 'ASC' } });
    }
    async getUserLevel(userId) {
        const user = await this.userRepo.findOne({
            where: { id: userId },
            select: ['total_points'],
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return this.levelRepo.findOne({
            where: { min_points: user.total_points },
            order: { min_points: 'DESC' },
        });
    }
    async getUserLevelInfo(userId) {
        const user = await this.userRepo.findOne({
            where: { id: userId },
            select: ['total_points'],
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        const allLevels = await this.levelRepo.find({ order: { min_points: 'ASC' } });
        let currentLevel = null;
        let nextLevel = null;
        for (const level of allLevels) {
            if (user.total_points >= level.min_points) {
                currentLevel = level;
            }
            else {
                nextLevel = level;
                break;
            }
        }
        let progress = 100;
        if (currentLevel && nextLevel) {
            const range = nextLevel.min_points - currentLevel.min_points;
            const earned = user.total_points - currentLevel.min_points;
            progress = range > 0 ? Math.round((earned / range) * 100) : 100;
        }
        return { level: currentLevel, progress };
    }
    async createLevel(data) {
        const level = this.levelRepo.create(data);
        return this.levelRepo.save(level);
    }
    async updateLevel(id, data) {
        const level = await this.levelRepo.findOne({ where: { id } });
        if (!level) {
            throw new common_1.NotFoundException('等级不存在');
        }
        Object.assign(level, data);
        return this.levelRepo.save(level);
    }
    async deleteLevel(id) {
        const result = await this.levelRepo.delete(id);
        if (result.affected === 0) {
            throw new common_1.NotFoundException('等级不存在');
        }
    }
    async initializeDefaultLevels() {
        const existing = await this.levelRepo.count();
        if (existing > 0)
            return;
        const defaults = [
            { name: '新手', slug: 'novice', min_points: 0, max_points: 49, color: '#9ca3af', description: '刚加入社区', sort_order: 0 },
            { name: '活跃', slug: 'active', min_points: 50, max_points: 199, color: '#3b82f6', description: '积极参与讨论', sort_order: 1 },
            { name: '核心', slug: 'core', min_points: 200, max_points: 499, color: '#8b5cf6', description: '社区核心成员', sort_order: 2 },
            { name: '精英', slug: 'elite', min_points: 500, max_points: 999, color: '#f59e0b', description: '社区精英', sort_order: 3 },
            { name: '大师', slug: 'master', min_points: 1000, max_points: undefined, color: '#ef4444', description: '社区大师', sort_order: 4 },
        ];
        for (const d of defaults) {
            await this.levelRepo.save(this.levelRepo.create(d));
        }
    }
};
exports.LevelsService = LevelsService;
exports.LevelsService = LevelsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(level_entity_1.Level)),
    __param(1, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], LevelsService);
//# sourceMappingURL=levels.service.js.map
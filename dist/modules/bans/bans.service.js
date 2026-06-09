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
exports.BansService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const index_1 = require("../../entities/index");
let BansService = class BansService {
    constructor(banRepository, userRepository) {
        this.banRepository = banRepository;
        this.userRepository = userRepository;
        this.banCache = new Map();
        this.cacheExpiry = 0;
        this.CACHE_TTL = 10000;
    }
    async create(dto) {
        if (!['user', 'ip', 'ip_range'].includes(dto.ban_type)) {
            throw new common_1.BadRequestException('Invalid ban type');
        }
        const ban = this.banRepository.create({
            ban_type: dto.ban_type,
            value: dto.value,
            reason: dto.reason,
            is_active: 1,
            created_by: dto.created_by,
        });
        const saved = await this.banRepository.save(ban);
        this.invalidateBanCache();
        return saved;
    }
    async getList(params) {
        const { page, limit, ban_type, is_active } = params;
        const skip = (page - 1) * limit;
        const where = {};
        if (ban_type)
            where.ban_type = ban_type;
        if (is_active !== undefined)
            where.is_active = is_active;
        const [data, total] = await this.banRepository.findAndCount({
            where,
            relations: ['creator'],
            select: {
                id: true,
                ban_type: true,
                value: true,
                reason: true,
                is_active: true,
                created_at: true,
                creator: {
                    id: true,
                    username: true,
                },
            },
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
    async getById(id) {
        const ban = await this.banRepository.findOne({
            where: { id },
            relations: ['creator'],
        });
        if (!ban) {
            throw new common_1.BadRequestException('Ban not found');
        }
        return ban;
    }
    async update(id, updates) {
        const ban = await this.getById(id);
        if (updates.reason !== undefined) {
            ban.reason = updates.reason;
        }
        if (updates.is_active !== undefined) {
            ban.is_active = updates.is_active;
        }
        const updated = await this.banRepository.save(ban);
        this.invalidateBanCache();
        return updated;
    }
    async deactivate(id) {
        await this.update(id, { is_active: 0 });
    }
    async isActive(type, value) {
        this.maybeRefreshCache();
        const cacheKey = `${type}:${value}`;
        return this.banCache.has(cacheKey);
    }
    async checkIp(ip) {
        this.maybeRefreshCache();
        if (this.banCache.has(`ip:${ip}`)) {
            return true;
        }
        for (const [key, entry] of this.banCache.entries()) {
            if (entry.ban_type === 'ip_range' && key.startsWith('ip_range:')) {
                if (this.ipInRange(ip, entry.value)) {
                    return true;
                }
            }
        }
        return false;
    }
    ipToNum(ip) {
        return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
    }
    ipInRange(ip, cidr) {
        const [range, bits] = cidr.split('/');
        const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);
        return (this.ipToNum(ip) & mask) === (this.ipToNum(range) & mask);
    }
    maybeRefreshCache() {
        const now = Date.now();
        if (now > this.cacheExpiry) {
            this.refreshBanCache();
        }
    }
    refreshBanCache() {
        this.banRepository.find({
            where: { is_active: 1 },
        }).then((bans) => {
            this.banCache.clear();
            for (const ban of bans) {
                const cacheKey = `${ban.ban_type}:${ban.value}`;
                this.banCache.set(cacheKey, {
                    ban_type: ban.ban_type,
                    value: ban.value,
                    reason: ban.reason,
                });
            }
            this.cacheExpiry = Date.now() + this.CACHE_TTL;
        }).catch((err) => {
            console.error('Failed to refresh ban cache:', err);
        });
    }
    invalidateBanCache() {
        this.cacheExpiry = 0;
    }
};
exports.BansService = BansService;
exports.BansService = BansService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(index_1.Ban)),
    __param(1, (0, typeorm_1.InjectRepository)(index_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], BansService);
//# sourceMappingURL=bans.service.js.map
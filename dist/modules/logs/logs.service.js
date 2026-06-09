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
exports.LogsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const index_1 = require("../../entities/index");
let LogsService = class LogsService {
    constructor(operationLogRepository, userRepository) {
        this.operationLogRepository = operationLogRepository;
        this.userRepository = userRepository;
    }
    async log(data) {
        const log = this.operationLogRepository.create({
            user_id: data.user_id,
            action: data.action,
            target_type: data.target_type,
            target_id: data.target_id,
            details: data.details,
            ip_address: data.ip_address,
            user_agent: data.user_agent,
        });
        return this.operationLogRepository.save(log);
    }
    async getLogs(params) {
        const { page, limit, user_id, action, target_type } = params;
        const skip = (page - 1) * limit;
        const where = {};
        if (user_id)
            where.user_id = user_id;
        if (action)
            where.action = action;
        if (target_type)
            where.target_type = target_type;
        const [data, total] = await this.operationLogRepository.findAndCount({
            where,
            relations: ['user'],
            select: {
                id: true,
                user_id: true,
                action: true,
                target_type: true,
                target_id: true,
                details: true,
                ip_address: true,
                user_agent: true,
                created_at: true,
                user: {
                    id: true,
                    username: true,
                    email: true,
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
};
exports.LogsService = LogsService;
exports.LogsService = LogsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(index_1.OperationLog)),
    __param(1, (0, typeorm_1.InjectRepository)(index_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository])
], LogsService);
//# sourceMappingURL=logs.service.js.map
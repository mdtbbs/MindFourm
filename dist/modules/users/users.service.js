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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../../entities/user.entity");
const post_entity_1 = require("../../entities/post.entity");
const reply_entity_1 = require("../../entities/reply.entity");
const search_util_1 = require("../../common/utils/search.util");
const settings_service_1 = require("../settings/settings.service");
let UsersService = class UsersService {
    constructor(userRepository, postRepository, replyRepository, settingsService) {
        this.userRepository = userRepository;
        this.postRepository = postRepository;
        this.replyRepository = replyRepository;
        this.settingsService = settingsService;
    }
    async getById(id) {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) {
            throw new common_1.NotFoundException(`User with id ${id} not found`);
        }
        const postCountResult = await this.postRepository
            .createQueryBuilder('post')
            .select('COUNT(*)', 'count')
            .where('post.user_id = :userId', { userId: id })
            .getRawOne();
        const replyCountResult = await this.replyRepository
            .createQueryBuilder('reply')
            .select('COUNT(*)', 'count')
            .where('reply.user_id = :userId', { userId: id })
            .getRawOne();
        return {
            ...user,
            post_count: parseInt(postCountResult.count, 10),
            reply_count: parseInt(replyCountResult.count, 10),
        };
    }
    async getByMindAuthId(mindauthId) {
        return this.userRepository.findOne({ where: { mindauth_id: mindauthId } });
    }
    async updateProfile(id, dto) {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) {
            throw new common_1.NotFoundException(`User with id ${id} not found`);
        }
        if (dto.username !== undefined) {
            user.username = dto.username;
        }
        if (dto.bio !== undefined) {
            user.bio = dto.bio;
        }
        return this.userRepository.save(user);
    }
    async updateAvatar(id, avatarUrl) {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) {
            throw new common_1.NotFoundException(`User with id ${id} not found`);
        }
        if (await this.settingsService.getBoolean('require_avatar_approval', true)) {
            user.pending_avatar_url = avatarUrl;
            user.avatar_status = 'pending';
        }
        else {
            user.avatar_url = avatarUrl;
            user.pending_avatar_url = null;
            user.avatar_status = 'approved';
        }
        return this.userRepository.save(user);
    }
    async removeAvatar(id) {
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) {
            throw new common_1.NotFoundException(`User with id ${id} not found`);
        }
        user.avatar_url = '';
        user.pending_avatar_url = null;
        user.avatar_status = 'approved';
        return this.userRepository.save(user);
    }
    async getRepliesByUserId(userId, page = 1, limit = 20) {
        const [replies, total] = await this.replyRepository.findAndCount({
            where: { user_id: userId },
            relations: ['post'],
            order: { created_at: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return { replies, total };
    }
    async updateRole(id, role) {
        const validRoles = ['user', 'moderator', 'admin'];
        if (!validRoles.includes(role)) {
            throw new common_1.BadRequestException(`Invalid role: ${role}`);
        }
        const user = await this.userRepository.findOne({ where: { id } });
        if (!user) {
            throw new common_1.NotFoundException(`User with id ${id} not found`);
        }
        user.role = role;
        return this.userRepository.save(user);
    }
    async getAll(page = 1, limit = 20, search) {
        const queryBuilder = this.userRepository.createQueryBuilder('user');
        if (search) {
            queryBuilder.where('user.username LIKE :search', { search: `%${(0, search_util_1.escapeLike)(search)}%` });
        }
        const [users, total] = await queryBuilder
            .orderBy('user.created_at', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();
        return { users, total };
    }
    async searchByUsername(query, limit = 10) {
        return this.userRepository.find({
            where: { username: (0, typeorm_2.Like)(`%${(0, search_util_1.escapeLike)(query)}%`) },
            take: limit,
            order: { username: 'ASC' },
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(post_entity_1.Post)),
    __param(2, (0, typeorm_1.InjectRepository)(reply_entity_1.Reply)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        settings_service_1.SettingsService])
], UsersService);
//# sourceMappingURL=users.service.js.map
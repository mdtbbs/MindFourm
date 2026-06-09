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
exports.GroupsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const group_entity_1 = require("../../entities/group.entity");
const group_member_entity_1 = require("../../entities/group-member.entity");
const user_entity_1 = require("../../entities/user.entity");
let GroupsService = class GroupsService {
    constructor(groupRepo, groupMemberRepo, userRepo) {
        this.groupRepo = groupRepo;
        this.groupMemberRepo = groupMemberRepo;
        this.userRepo = userRepo;
    }
    async getAllGroups() {
        return this.groupRepo.find({ order: { sort_order: 'ASC' } });
    }
    async getGroupBySlug(slug) {
        const group = await this.groupRepo.findOne({
            where: { slug },
            relations: ['members'],
        });
        if (!group)
            throw new common_1.NotFoundException('组不存在');
        return group;
    }
    async getGroupMembers(slug, page = 1, limit = 20) {
        const group = await this.groupRepo.findOne({ where: { slug } });
        if (!group)
            throw new common_1.NotFoundException('组不存在');
        const cappedLimit = Math.min(limit, 50);
        const skip = (page - 1) * cappedLimit;
        const [members, total] = await this.groupMemberRepo.findAndCount({
            where: { group_id: group.id },
            relations: ['user'],
            order: { joined_at: 'DESC' },
            skip,
            take: cappedLimit,
        });
        return {
            members: members.map(m => ({ ...m.user, role: m.role, joined_at: m.joined_at })),
            total,
            page,
            limit: cappedLimit,
            totalPages: Math.ceil(total / cappedLimit),
        };
    }
    async joinGroup(groupId, userId) {
        const group = await this.groupRepo.findOne({ where: { id: groupId } });
        if (!group)
            throw new common_1.NotFoundException('组不存在');
        const existing = await this.groupMemberRepo.findOne({
            where: { group_id: groupId, user_id: userId },
        });
        if (existing)
            throw new common_1.BadRequestException('已加入该组');
        const member = this.groupMemberRepo.create({
            group_id: groupId,
            user_id: userId,
            role: 'member',
        });
        return this.groupMemberRepo.save(member);
    }
    async leaveGroup(groupId, userId) {
        const result = await this.groupMemberRepo.delete({
            group_id: groupId,
            user_id: userId,
        });
        if (result.affected === 0)
            throw new common_1.BadRequestException('未加入该组');
    }
    async getMyGroups(userId) {
        const memberships = await this.groupMemberRepo.find({
            where: { user_id: userId },
            relations: ['group'],
            order: { joined_at: 'DESC' },
        });
        return memberships.map(m => m.group);
    }
    async checkMembership(groupId, userId) {
        const member = await this.groupMemberRepo.findOne({
            where: { group_id: groupId, user_id: userId },
        });
        return !!member;
    }
    async adminGetAllGroups() {
        return this.groupRepo.find({ order: { created_at: 'DESC' } });
    }
    async adminCreateGroup(data) {
        if (!data.slug && data.name) {
            data.slug = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
        }
        const group = this.groupRepo.create(data);
        return this.groupRepo.save(group);
    }
    async adminUpdateGroup(id, data) {
        const group = await this.groupRepo.findOne({ where: { id } });
        if (!group)
            throw new common_1.NotFoundException('组不存在');
        Object.assign(group, data);
        return this.groupRepo.save(group);
    }
    async adminDeleteGroup(id) {
        const group = await this.groupRepo.findOne({ where: { id } });
        if (!group)
            throw new common_1.NotFoundException('组不存在');
        if (group.is_system)
            throw new common_1.ForbiddenException('系统组不可删除');
        await this.groupMemberRepo.delete({ group_id: id });
        await this.groupRepo.delete(id);
    }
    async adminAddMember(groupId, userId, role = 'member') {
        const group = await this.groupRepo.findOne({ where: { id: groupId } });
        if (!group)
            throw new common_1.NotFoundException('组不存在');
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('用户不存在');
        const existing = await this.groupMemberRepo.findOne({
            where: { group_id: groupId, user_id: userId },
        });
        if (existing) {
            existing.role = role;
            return this.groupMemberRepo.save(existing);
        }
        const member = this.groupMemberRepo.create({ group_id: groupId, user_id: userId, role });
        return this.groupMemberRepo.save(member);
    }
    async adminRemoveMember(groupId, userId) {
        const result = await this.groupMemberRepo.delete({
            group_id: groupId,
            user_id: userId,
        });
        if (result.affected === 0)
            throw new common_1.BadRequestException('用户未加入该组');
    }
};
exports.GroupsService = GroupsService;
exports.GroupsService = GroupsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(group_entity_1.Group)),
    __param(1, (0, typeorm_1.InjectRepository)(group_member_entity_1.GroupMember)),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], GroupsService);
//# sourceMappingURL=groups.service.js.map
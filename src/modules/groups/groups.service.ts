import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from '@entities/group.entity';
import { GroupMember } from '@entities/group-member.entity';
import { User } from '@entities/user.entity';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private groupRepo: Repository<Group>,
    @InjectRepository(GroupMember)
    private groupMemberRepo: Repository<GroupMember>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  // === Public API ===

  async getAllGroups(): Promise<Group[]> {
    return this.groupRepo.find({ order: { sort_order: 'ASC' } });
  }

  async getGroupBySlug(slug: string): Promise<Group> {
    const group = await this.groupRepo.findOne({
      where: { slug },
      relations: ['members'],
    });
    if (!group) throw new NotFoundException('组不存在');
    return group;
  }

  async getGroupMembers(slug: string, page: number = 1, limit: number = 20) {
    const group = await this.groupRepo.findOne({ where: { slug } });
    if (!group) throw new NotFoundException('组不存在');

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

  async joinGroup(groupId: number, userId: number): Promise<GroupMember> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('组不存在');

    const existing = await this.groupMemberRepo.findOne({
      where: { group_id: groupId, user_id: userId },
    });
    if (existing) throw new BadRequestException('已加入该组');

    const member = this.groupMemberRepo.create({
      group_id: groupId,
      user_id: userId,
      role: 'member',
    });
    return this.groupMemberRepo.save(member);
  }

  async leaveGroup(groupId: number, userId: number): Promise<void> {
    const result = await this.groupMemberRepo.delete({
      group_id: groupId,
      user_id: userId,
    });
    if (result.affected === 0) throw new BadRequestException('未加入该组');
  }

  async getMyGroups(userId: number): Promise<Group[]> {
    const memberships = await this.groupMemberRepo.find({
      where: { user_id: userId },
      relations: ['group'],
      order: { joined_at: 'DESC' },
    });
    return memberships.map(m => m.group);
  }

  async checkMembership(groupId: number, userId: number): Promise<boolean> {
    const member = await this.groupMemberRepo.findOne({
      where: { group_id: groupId, user_id: userId },
    });
    return !!member;
  }

  // === Admin API ===

  async adminGetAllGroups(): Promise<Group[]> {
    return this.groupRepo.find({ order: { created_at: 'DESC' } });
  }

  async adminCreateGroup(data: Partial<Group>): Promise<Group> {
    // Generate slug from name if not provided
    if (!data.slug && data.name) {
      data.slug = data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    }
    const group = this.groupRepo.create(data);
    return this.groupRepo.save(group);
  }

  async adminUpdateGroup(id: number, data: Partial<Group>): Promise<Group> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) throw new NotFoundException('组不存在');
    Object.assign(group, data);
    return this.groupRepo.save(group);
  }

  async adminDeleteGroup(id: number): Promise<void> {
    const group = await this.groupRepo.findOne({ where: { id } });
    if (!group) throw new NotFoundException('组不存在');
    if (group.is_system) throw new ForbiddenException('系统组不可删除');
    // Delete members first
    await this.groupMemberRepo.delete({ group_id: id });
    await this.groupRepo.delete(id);
  }

  async adminAddMember(groupId: number, userId: number, role: string = 'member'): Promise<GroupMember> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('组不存在');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

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

  async adminRemoveMember(groupId: number, userId: number): Promise<void> {
    const result = await this.groupMemberRepo.delete({
      group_id: groupId,
      user_id: userId,
    });
    if (result.affected === 0) throw new BadRequestException('用户未加入该组');
  }
}

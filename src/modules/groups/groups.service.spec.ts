const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  PrimaryColumn: decorator,
  Column: decorator,
  ManyToOne: decorator,
  OneToMany: decorator,
  ManyToMany: decorator,
  OneToOne: decorator,
  JoinColumn: decorator,
  JoinTable: decorator,
  CreateDateColumn: decorator,
  UpdateDateColumn: decorator,
  DeleteDateColumn: decorator,
  Index: decorator,
  Unique: decorator,
}));

jest.mock('@entities/index', () => ({
  Group: class Group {},
  GroupMember: class GroupMember {},
  User: class User {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';

function createService() {
  const groupRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 1, ...v })),
    delete: jest.fn(),
  };
  const groupMemberRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 1, ...v })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const userRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };
  const service = new GroupsService(
    groupRepo as any,
    groupMemberRepo as any,
    userRepo as any,
  );
  return { service, groupRepo, groupMemberRepo, userRepo };
}

describe('GroupsService.joinGroup', () => {
  it('rejects a group that does not exist', async () => {
    const { service, groupMemberRepo } = createService();
    // default groupRepo.findOne mock resolves null

    await expect(service.joinGroup(99, 7)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.joinGroup(99, 7)).rejects.toThrow('组不存在');
    expect(groupMemberRepo.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate membership', async () => {
    const { service, groupRepo, groupMemberRepo } = createService();
    groupRepo.findOne.mockResolvedValue({ id: 1, slug: 'core' });
    groupMemberRepo.findOne.mockResolvedValue({ id: 5, group_id: 1, user_id: 7 });

    await expect(service.joinGroup(1, 7)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.joinGroup(1, 7)).rejects.toThrow('已加入该组');
    expect(groupMemberRepo.save).not.toHaveBeenCalled();
  });

  it('creates a member with the default role', async () => {
    const { service, groupRepo, groupMemberRepo } = createService();
    groupRepo.findOne.mockResolvedValue({ id: 3, slug: 'core' });
    groupMemberRepo.findOne.mockResolvedValue(null);

    await service.joinGroup(3, 7);

    expect(groupMemberRepo.create).toHaveBeenCalledWith({
      group_id: 3,
      user_id: 7,
      role: 'member',
    });
    expect(groupMemberRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: 3, user_id: 7, role: 'member' }),
    );
  });
});

describe('GroupsService.leaveGroup', () => {
  it('throws when nothing was deleted', async () => {
    const { service, groupMemberRepo } = createService();
    groupMemberRepo.delete.mockResolvedValue({ affected: 0 });

    await expect(service.leaveGroup(1, 7)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.leaveGroup(1, 7)).rejects.toThrow('未加入该组');
  });

  it('resolves and scopes the delete to group + user', async () => {
    const { service, groupMemberRepo } = createService();
    groupMemberRepo.delete.mockResolvedValue({ affected: 1 });

    await expect(service.leaveGroup(1, 7)).resolves.toBeUndefined();
    expect(groupMemberRepo.delete).toHaveBeenCalledWith({ group_id: 1, user_id: 7 });
  });
});

describe('GroupsService.getMyGroups', () => {
  it('returns the group entities, newest membership first', async () => {
    const { service, groupMemberRepo } = createService();
    const core = { id: 1, slug: 'core' };
    const news = { id: 2, slug: 'news' };
    groupMemberRepo.find.mockResolvedValue([
      { id: 11, group_id: 1, user_id: 7, role: 'member', group: core },
      { id: 12, group_id: 2, user_id: 7, role: 'admin', group: news },
    ]);

    await expect(service.getMyGroups(7)).resolves.toEqual([core, news]);

    expect(groupMemberRepo.find).toHaveBeenCalledWith({
      where: { user_id: 7 },
      relations: ['group'],
      order: { joined_at: 'DESC' },
    });
  });

  it('returns an empty list for a user without memberships', async () => {
    const { service } = createService();

    await expect(service.getMyGroups(7)).resolves.toEqual([]);
  });

  it('does not leak membership rows into the result', async () => {
    const { service, groupMemberRepo } = createService();
    groupMemberRepo.find.mockResolvedValue([{ id: 11, role: 'admin', group: { id: 1 } }]);

    const groups = await service.getMyGroups(7);

    expect(groups).toHaveLength(1);
    expect(groups[0]).not.toHaveProperty('role');
  });
});

describe('GroupsService.checkMembership', () => {
  it('is true when a row exists', async () => {
    const { service, groupMemberRepo } = createService();
    groupMemberRepo.findOne.mockResolvedValue({ id: 5 });

    await expect(service.checkMembership(1, 7)).resolves.toBe(true);
    expect(groupMemberRepo.findOne).toHaveBeenCalledWith({
      where: { group_id: 1, user_id: 7 },
    });
  });

  it('is false when no row exists', async () => {
    const { service, groupMemberRepo } = createService();
    groupMemberRepo.findOne.mockResolvedValue(null);

    await expect(service.checkMembership(1, 7)).resolves.toBe(false);
  });
});

describe('GroupsService.getGroupBySlug', () => {
  it('throws when the slug is unknown', async () => {
    const { service, groupRepo } = createService();
    groupRepo.findOne.mockResolvedValue(null);

    await expect(service.getGroupBySlug('nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getGroupBySlug('nope')).rejects.toThrow('组不存在');
    expect(groupRepo.findOne).toHaveBeenCalledWith({
      where: { slug: 'nope' },
      relations: ['members'],
    });
  });

  it('returns the group with its members loaded', async () => {
    const { service, groupRepo } = createService();
    const group = { id: 1, slug: 'core', members: [{ id: 5 }] };
    groupRepo.findOne.mockResolvedValue(group);

    await expect(service.getGroupBySlug('core')).resolves.toBe(group);
  });
});

describe('GroupsService.getGroupMembers', () => {
  it('throws for an unknown slug', async () => {
    const { service, groupMemberRepo } = createService();

    await expect(service.getGroupMembers('nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(groupMemberRepo.findAndCount).not.toHaveBeenCalled();
  });

  it('paginates with a 20-item default page', async () => {
    const { service, groupRepo, groupMemberRepo } = createService();
    groupRepo.findOne.mockResolvedValue({ id: 4 });
    groupMemberRepo.findAndCount.mockResolvedValue([[], 45]);

    const result = await service.getGroupMembers('core');

    expect(groupMemberRepo.findAndCount).toHaveBeenCalledWith({
      where: { group_id: 4 },
      relations: ['user'],
      order: { joined_at: 'DESC' },
      skip: 0,
      take: 20,
    });
    expect(result).toMatchObject({ total: 45, page: 1, limit: 20, totalPages: 3 });
  });

  it('computes the offset for later pages', async () => {
    const { service, groupRepo, groupMemberRepo } = createService();
    groupRepo.findOne.mockResolvedValue({ id: 4 });
    groupMemberRepo.findAndCount.mockResolvedValue([[], 45]);

    const result = await service.getGroupMembers('core', 3, 10);

    expect(groupMemberRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
    expect(result).toMatchObject({ page: 3, limit: 10, totalPages: 5 });
  });

  it('caps the page size at 50 and uses the cap for the offset', async () => {
    const { service, groupRepo, groupMemberRepo } = createService();
    groupRepo.findOne.mockResolvedValue({ id: 4 });
    groupMemberRepo.findAndCount.mockResolvedValue([[], 200]);

    const result = await service.getGroupMembers('core', 2, 500);

    expect(groupMemberRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 }),
    );
    expect(result).toMatchObject({ page: 2, limit: 50, totalPages: 4 });
  });

  it('flattens each member row into the user plus role and join date', async () => {
    const { service, groupRepo, groupMemberRepo } = createService();
    const joinedAt = new Date('2026-01-02T03:04:05Z');
    groupRepo.findOne.mockResolvedValue({ id: 4 });
    groupMemberRepo.findAndCount.mockResolvedValue([
      [
        {
          id: 11,
          role: 'admin',
          joined_at: joinedAt,
          user: { id: 7, username: 'alice' },
        },
      ],
      1,
    ]);

    const result = await service.getGroupMembers('core', 1);

    expect(result.members).toEqual([{ id: 7, username: 'alice', role: 'admin', joined_at: joinedAt }]);
    expect(result.members[0]).not.toHaveProperty('group_id');
  });
});

describe('GroupsService.adminAddMember', () => {
  it('throws when the group is missing', async () => {
    const { service, userRepo, groupMemberRepo } = createService();

    await expect(service.adminAddMember(9, 7)).rejects.toBeInstanceOf(NotFoundException);
    expect(userRepo.findOne).not.toHaveBeenCalled();
    expect(groupMemberRepo.save).not.toHaveBeenCalled();
  });

  it('throws when the user is missing', async () => {
    const { service, groupRepo, userRepo, groupMemberRepo } = createService();
    groupRepo.findOne.mockResolvedValue({ id: 1 });
    userRepo.findOne.mockResolvedValue(null);

    await expect(service.adminAddMember(1, 7)).rejects.toThrow('用户不存在');
    await expect(service.adminAddMember(1, 7)).rejects.toBeInstanceOf(NotFoundException);
    expect(groupMemberRepo.save).not.toHaveBeenCalled();
  });

  it("defaults the role to 'member'", async () => {
    const { service, groupRepo, userRepo, groupMemberRepo } = createService();
    groupRepo.findOne.mockResolvedValue({ id: 1 });
    userRepo.findOne.mockResolvedValue({ id: 7 });

    await service.adminAddMember(1, 7);

    expect(groupMemberRepo.create).toHaveBeenCalledWith({
      group_id: 1,
      user_id: 7,
      role: 'member',
    });
    expect(groupMemberRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'member' }),
    );
  });

  it('honours an explicit role', async () => {
    const { service, groupRepo, userRepo, groupMemberRepo } = createService();
    groupRepo.findOne.mockResolvedValue({ id: 1 });
    userRepo.findOne.mockResolvedValue({ id: 7 });

    await service.adminAddMember(1, 7, 'owner');

    expect(groupMemberRepo.create).toHaveBeenCalledWith({
      group_id: 1,
      user_id: 7,
      role: 'owner',
    });
  });

  it('updates the role of an existing member instead of duplicating the row', async () => {
    const { service, groupRepo, userRepo, groupMemberRepo } = createService();
    groupRepo.findOne.mockResolvedValue({ id: 1 });
    userRepo.findOne.mockResolvedValue({ id: 7 });
    const existing = { id: 11, group_id: 1, user_id: 7, role: 'member' };
    groupMemberRepo.findOne.mockResolvedValue(existing);

    await service.adminAddMember(1, 7, 'admin');

    expect(existing.role).toBe('admin');
    expect(groupMemberRepo.create).not.toHaveBeenCalled();
    expect(groupMemberRepo.save).toHaveBeenCalledWith(existing);
  });
});

describe('GroupsService.adminRemoveMember', () => {
  it('throws when the user was not a member', async () => {
    const { service, groupMemberRepo } = createService();
    groupMemberRepo.delete.mockResolvedValue({ affected: 0 });

    await expect(service.adminRemoveMember(1, 7)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.adminRemoveMember(1, 7)).rejects.toThrow('用户未加入该组');
  });

  it('deletes the membership scoped to group + user', async () => {
    const { service, groupMemberRepo } = createService();
    groupMemberRepo.delete.mockResolvedValue({ affected: 1 });

    await expect(service.adminRemoveMember(1, 7)).resolves.toBeUndefined();
    expect(groupMemberRepo.delete).toHaveBeenCalledWith({ group_id: 1, user_id: 7 });
  });
});

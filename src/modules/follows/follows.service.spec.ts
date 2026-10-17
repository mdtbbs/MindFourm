const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
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

jest.mock('@entities/follow.entity', () => ({ Follow: class Follow {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FollowsService } from './follows.service';

interface StubFollow {
  id: number;
  follower_id: number;
  following_id: number;
  created_at?: Date;
  follower?: Record<string, any>;
  following?: Record<string, any>;
}

function createService(options: {
  rows?: StubFollow[];
  total?: number;
  targetUser?: Record<string, any> | null;
  existingFollow?: StubFollow | null;
  deleteAffected?: number;
  countFollowers?: number;
  countFollowing?: number;
} = {}) {
  const user = options.targetUser === undefined ? { id: 2, username: 'bob' } : options.targetUser;
  const deleteAffected = options.deleteAffected ?? 1;

  const followRepo = {
    findOne: jest.fn().mockResolvedValue(options.existingFollow ?? null),
    findAndCount: jest.fn().mockResolvedValue([options.rows ?? [], options.total ?? 0]),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ id: 99, created_at: new Date('2024-01-01'), ...v })),
    delete: jest.fn().mockResolvedValue({ affected: deleteAffected }),
    count: jest
      .fn()
      .mockResolvedValueOnce(options.countFollowers ?? 0)
      .mockResolvedValueOnce(options.countFollowing ?? 0),
  };
  const userRepo = { findOne: jest.fn().mockResolvedValue(user) };

  const service = new FollowsService(followRepo as any, userRepo as any, {} as any);
  return { service, followRepo, userRepo };
}

const publicUser = (id: number) => ({
  id,
  username: `user${id}`,
  email: `user${id}@example.com`,
  available_points: 500,
  phone_verified: true,
  avatar_url: null,
});

describe('FollowsService.followUser', () => {
  it('rejects following yourself before touching the database', async () => {
    const { service, followRepo, userRepo } = createService();

    await expect(service.followUser(7, 7)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.followUser(7, 7)).rejects.toThrow('不能关注自己');

    expect(userRepo.findOne).not.toHaveBeenCalled();
    expect(followRepo.save).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the target user does not exist', async () => {
    const { service, followRepo, userRepo } = createService({ targetUser: null });

    await expect(service.followUser(1, 4242)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.followUser(1, 4242)).rejects.toThrow('用户不存在');

    expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 4242 } });
    expect(followRepo.create).not.toHaveBeenCalled();
    expect(followRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate follow instead of inserting a second row', async () => {
    const existing = { id: 5, follower_id: 1, following_id: 2 };
    const { service, followRepo } = createService({ existingFollow: existing });

    await expect(service.followUser(1, 2)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.followUser(1, 2)).rejects.toThrow('已关注该用户');

    expect(followRepo.findOne).toHaveBeenCalledWith({
      where: { follower_id: 1, following_id: 2 },
    });
    expect(followRepo.create).not.toHaveBeenCalled();
    expect(followRepo.save).not.toHaveBeenCalled();
  });

  it('creates and persists the follow relation for a valid request', async () => {
    const { service, followRepo } = createService();

    const result = await service.followUser(1, 2);

    expect(followRepo.create).toHaveBeenCalledWith({ follower_id: 1, following_id: 2 });
    expect(followRepo.save).toHaveBeenCalledWith({ follower_id: 1, following_id: 2 });
    expect(result).toEqual({
      id: 99,
      created_at: new Date('2024-01-01'),
      follower_id: 1,
      following_id: 2,
    });
  });
});

describe('FollowsService.unfollowUser', () => {
  it('deletes the composite-key row', async () => {
    const { service, followRepo } = createService({ deleteAffected: 1 });

    await expect(service.unfollowUser(1, 2)).resolves.toBeUndefined();
    expect(followRepo.delete).toHaveBeenCalledWith({ follower_id: 1, following_id: 2 });
  });

  it('throws when nothing was deleted', async () => {
    const { service } = createService({ deleteAffected: 0 });

    await expect(service.unfollowUser(1, 2)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.unfollowUser(1, 2)).rejects.toThrow('未关注该用户');
  });
});

describe('FollowsService.checkFollowStatus', () => {
  it('returns true when the relation exists', async () => {
    const { service, followRepo } = createService({
      existingFollow: { id: 3, follower_id: 1, following_id: 2 },
    });

    await expect(service.checkFollowStatus(1, 2)).resolves.toBe(true);
    expect(followRepo.findOne).toHaveBeenCalledWith({
      where: { follower_id: 1, following_id: 2 },
    });
  });

  it('returns false when the relation is missing', async () => {
    const { service } = createService({ existingFollow: null });

    await expect(service.checkFollowStatus(1, 2)).resolves.toBe(false);
  });
});

describe('FollowsService.getFollowers', () => {
  it('queries by following_id with follower relation and default paging', async () => {
    const { service, followRepo } = createService({
      rows: [{ id: 1, follower_id: 10, following_id: 2, follower: publicUser(10) }],
      total: 1,
    });

    const result = await service.getFollowers(2);

    expect(followRepo.findAndCount).toHaveBeenCalledWith({
      where: { following_id: 2 },
      relations: ['follower'],
      order: { created_at: 'DESC' },
      skip: 0,
      take: 20,
    });
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(1);
  });

  it('builds the follower list from the joined relation and strips private fields', async () => {
    const { service } = createService({
      rows: [{ id: 1, follower_id: 10, following_id: 2, follower: publicUser(10) }],
      total: 1,
    });

    const result = await service.getFollowers(2);

    expect(result.users).toEqual([
      { id: 10, username: 'user10', avatar_url: null },
    ]);
  });

  it('computes skip from the raw page and caps limit at 50', async () => {
    const { service, followRepo } = createService({ rows: [], total: 120 });

    const result = await service.getFollowing(2, 3, 100);

    expect(followRepo.findAndCount).toHaveBeenCalledWith({
      where: { follower_id: 2 },
      relations: ['following'],
      order: { created_at: 'DESC' },
      skip: 200,
      take: 50,
    });
    expect(result.limit).toBe(50);
    expect(result.totalPages).toBe(3);
  });

  it('rounds totalPages up and returns an empty list when there is no follower', async () => {
    const { service } = createService({ rows: [], total: 0 });

    const result = await service.getFollowers(2, 2, 20);

    expect(result.users).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });
});

describe('FollowsService.getFollowing', () => {
  it('queries by follower_id and maps the following relation', async () => {
    const { service, followRepo } = createService({
      rows: [{ id: 1, follower_id: 2, following_id: 11, following: publicUser(11) }],
      total: 21,
    });

    const result = await service.getFollowing(2, 2, 20);

    expect(followRepo.findAndCount).toHaveBeenCalledWith({
      where: { follower_id: 2 },
      relations: ['following'],
      order: { created_at: 'DESC' },
      skip: 20,
      take: 20,
    });
    expect(result.users).toEqual([{ id: 11, username: 'user11', avatar_url: null }]);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(2);
  });
});

describe('FollowsService.getFollowCounts', () => {
  it('counts followers and following separately without swapping them', async () => {
    const { service, followRepo } = createService({ countFollowers: 7, countFollowing: 3 });

    await expect(service.getFollowCounts(2)).resolves.toEqual({ followers: 7, following: 3 });

    expect(followRepo.count).toHaveBeenNthCalledWith(1, { where: { following_id: 2 } });
    expect(followRepo.count).toHaveBeenNthCalledWith(2, { where: { follower_id: 2 } });
  });

  it('reports zeros for a user with no relations', async () => {
    const { service } = createService({ countFollowers: 0, countFollowing: 0 });

    await expect(service.getFollowCounts(2)).resolves.toEqual({ followers: 0, following: 0 });
  });
});

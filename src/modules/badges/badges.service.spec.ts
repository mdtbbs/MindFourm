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

jest.mock('@entities/badge.entity', () => ({ Badge: class Badge {} }));
jest.mock('@entities/user-badge.entity', () => ({ UserBadge: class UserBadge {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BadgesService } from './badges.service';

function createService() {
  const badgeRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: any) => ({ ...v })),
    save: jest.fn(async (v: any) => (Array.isArray(v) ? v.map((x, i) => ({ id: i + 1, ...x })) : { id: 1, ...v })),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const userBadgeRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: any) => ({ ...v })),
    save: jest.fn(async (v: any) => (Array.isArray(v) ? v.map((x, i) => ({ id: i + 1, ...x })) : v)),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const userRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 1 }),
  };

  const service = new BadgesService(
    badgeRepo as any,
    userBadgeRepo as any,
    userRepo as any,
  );
  return { service, badgeRepo, userBadgeRepo, userRepo };
}

describe('BadgesService.getAllBadges', () => {
  it('queries only active badges ordered by level', async () => {
    const { service, badgeRepo } = createService();
    const rows = [{ id: 1, slug: 'first-post' }];
    badgeRepo.find.mockResolvedValue(rows);

    await expect(service.getAllBadges()).resolves.toBe(rows);
    expect(badgeRepo.find).toHaveBeenCalledWith({
      where: { is_active: 1 },
      order: { level: 'ASC' },
    });
  });
});

describe('BadgesService.getUserBadges', () => {
  it('loads the badge relation for the given user, newest first', async () => {
    const { service, userBadgeRepo } = createService();
    const rows = [{ id: 5, user_id: 42, badge_id: 2 }];
    userBadgeRepo.find.mockResolvedValue(rows);

    await expect(service.getUserBadges(42)).resolves.toBe(rows);
    expect(userBadgeRepo.find).toHaveBeenCalledWith({
      where: { user_id: 42 },
      relations: ['badge'],
      order: { granted_at: 'DESC' },
    });
  });
});

describe('BadgesService.awardBadge', () => {
  it('throws NotFoundException when the user does not exist', async () => {
    const { service, userRepo, badgeRepo } = createService();
    userRepo.findOne.mockResolvedValue(null);

    await expect(service.awardBadge(99, 1)).rejects.toThrow(new NotFoundException('User not found'));
    // Short-circuits before touching the badge table.
    expect(badgeRepo.findOne).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the badge does not exist', async () => {
    const { service, badgeRepo, userBadgeRepo } = createService();
    badgeRepo.findOne.mockResolvedValue(null);

    await expect(service.awardBadge(1, 404)).rejects.toThrow(new NotFoundException('Badge not found'));
    expect(badgeRepo.findOne).toHaveBeenCalledWith({ where: { id: 404 } });
    expect(userBadgeRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate award instead of inserting a second row', async () => {
    const { service, badgeRepo, userBadgeRepo } = createService();
    badgeRepo.findOne.mockResolvedValue({ id: 3 });
    userBadgeRepo.findOne.mockResolvedValue({ id: 77, user_id: 1, badge_id: 3 });

    await expect(service.awardBadge(1, 3)).rejects.toThrow(
      new BadRequestException('用户已获得此徽章'),
    );
    expect(userBadgeRepo.findOne).toHaveBeenCalledWith({
      where: { user_id: 1, badge_id: 3 },
    });
    expect(userBadgeRepo.create).not.toHaveBeenCalled();
    expect(userBadgeRepo.save).not.toHaveBeenCalled();
  });

  it('creates and returns the new record, forwarding grantedBy', async () => {
    const { service, badgeRepo, userBadgeRepo } = createService();
    badgeRepo.findOne.mockResolvedValue({ id: 3 });

    const result = await service.awardBadge(1, 3, 9);

    expect(userBadgeRepo.create).toHaveBeenCalledWith({
      user_id: 1,
      badge_id: 3,
      granted_by: 9,
    });
    expect(userBadgeRepo.save).toHaveBeenCalledWith([
      { user_id: 1, badge_id: 3, granted_by: 9 },
    ]);
    // save() returns an array; the service must unwrap the first element.
    expect(result).toEqual({ id: 1, user_id: 1, badge_id: 3, granted_by: 9 });
  });

  it('leaves granted_by undefined when awarded without a granting admin', async () => {
    const { service, badgeRepo, userBadgeRepo } = createService();
    badgeRepo.findOne.mockResolvedValue({ id: 3 });

    await service.awardBadge(1, 3);

    expect(userBadgeRepo.create).toHaveBeenCalledWith({
      user_id: 1,
      badge_id: 3,
      granted_by: undefined,
    });
  });
});

describe('BadgesService.removeUserBadge', () => {
  it('deletes the composite record', async () => {
    const { service, userBadgeRepo } = createService();

    await expect(service.removeUserBadge(1, 3)).resolves.toBeUndefined();
    expect(userBadgeRepo.delete).toHaveBeenCalledWith({ user_id: 1, badge_id: 3 });
  });

  it('throws NotFoundException when nothing was deleted', async () => {
    const { service, userBadgeRepo } = createService();
    userBadgeRepo.delete.mockResolvedValue({ affected: 0 });

    await expect(service.removeUserBadge(1, 3)).rejects.toThrow(
      new NotFoundException('徽章记录不存在'),
    );
  });
});

describe('BadgesService.adminGetAllBadges', () => {
  it('lists every badge regardless of is_active, newest first', async () => {
    const { service, badgeRepo } = createService();
    const rows = [{ id: 1, is_active: 0 }];
    badgeRepo.find.mockResolvedValue(rows);

    await expect(service.adminGetAllBadges()).resolves.toBe(rows);
    expect(badgeRepo.find).toHaveBeenCalledWith({ order: { created_at: 'DESC' } });
  });
});

describe('BadgesService.adminCreateBadge', () => {
  it('persists the payload through create/save and returns the saved row', async () => {
    const { service, badgeRepo } = createService();
    badgeRepo.save.mockResolvedValue({ id: 12, name: '新徽章', slug: 'new-badge' });

    const result = await service.adminCreateBadge({ name: '新徽章', slug: 'new-badge' } as any);

    expect(badgeRepo.create).toHaveBeenCalledWith({ name: '新徽章', slug: 'new-badge' });
    expect(badgeRepo.save).toHaveBeenCalledWith({ name: '新徽章', slug: 'new-badge' });
    expect(result).toEqual({ id: 12, name: '新徽章', slug: 'new-badge' });
  });
});

describe('BadgesService.adminUpdateBadge', () => {
  it('merges the patch onto the stored badge and saves it', async () => {
    const { service, badgeRepo } = createService();
    const stored: any = { id: 4, name: '旧名', slug: 'old', is_active: 1 };
    badgeRepo.findOne.mockResolvedValue(stored);
    badgeRepo.save.mockImplementation(async (v: any) => v);

    const result = await service.adminUpdateBadge(4, { name: '新名' } as any);

    expect(badgeRepo.findOne).toHaveBeenCalledWith({ where: { id: 4 } });
    expect(badgeRepo.create).not.toHaveBeenCalled();
    // Untouched columns survive the patch.
    expect(result).toMatchObject({ id: 4, name: '新名', slug: 'old', is_active: 1 });
    expect(badgeRepo.save).toHaveBeenCalledWith(stored);
  });

  it('throws NotFoundException for an unknown id and does not save', async () => {
    const { service, badgeRepo } = createService();
    badgeRepo.findOne.mockResolvedValue(null);

    await expect(service.adminUpdateBadge(404, { name: 'x' } as any)).rejects.toThrow(
      new NotFoundException('徽章不存在'),
    );
    expect(badgeRepo.save).not.toHaveBeenCalled();
  });
});

describe('BadgesService.adminDeleteBadge', () => {
  it('deletes by id', async () => {
    const { service, badgeRepo } = createService();

    await expect(service.adminDeleteBadge(4)).resolves.toBeUndefined();
    expect(badgeRepo.delete).toHaveBeenCalledWith(4);
  });

  it('throws NotFoundException when the id does not exist', async () => {
    const { service, badgeRepo } = createService();
    badgeRepo.delete.mockResolvedValue({ affected: 0 });

    await expect(service.adminDeleteBadge(404)).rejects.toThrow(
      new NotFoundException('徽章不存在'),
    );
  });
});

describe('BadgesService.initializeDefaultBadges', () => {
  it('seeds the four default badges when the table is empty', async () => {
    const { service, badgeRepo } = createService();
    badgeRepo.count.mockResolvedValue(0);

    await service.initializeDefaultBadges();

    expect(badgeRepo.count).toHaveBeenCalledTimes(1);
    expect(badgeRepo.create).toHaveBeenCalledTimes(4);
    expect(badgeRepo.save).toHaveBeenCalledTimes(4);

    const saved = badgeRepo.save.mock.calls.map((c) => c[0]);
    expect(saved.map((b: any) => b.slug)).toEqual([
      'first-post',
      'prolific-writer',
      'popular',
      'veteran',
    ]);
    expect(saved.map((b: any) => b.level)).toEqual(['bronze', 'silver', 'gold', 'platinum']);
    expect(saved.map((b: any) => b.is_active)).toEqual([1, 1, 1, 1]);
    for (const b of saved as any[]) {
      expect(b.name).toBeTruthy();
      expect(b.icon).toBeTruthy();
      expect(b.description).toBeTruthy();
      // criteria is stored as a JSON string.
      expect(() => JSON.parse(b.criteria)).not.toThrow();
    }
  });

  it('is a no-op when badges already exist', async () => {
    const { service, badgeRepo } = createService();
    badgeRepo.count.mockResolvedValue(3);

    await expect(service.initializeDefaultBadges()).resolves.toBeUndefined();

    expect(badgeRepo.create).not.toHaveBeenCalled();
    expect(badgeRepo.save).not.toHaveBeenCalled();
  });
});

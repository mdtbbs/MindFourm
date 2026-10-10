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

jest.mock('@entities/level.entity', () => ({ Level: class Level {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));

import { NotFoundException } from '@nestjs/common';
import { LevelsService } from './levels.service';

function level(min_points: number, extra: Record<string, any> = {}) {
  return { id: min_points + 1, name: `L${min_points}`, slug: `l-${min_points}`, min_points, ...extra };
}

function createService() {
  const levelRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((v: any) => ({ ...v })),
    save: jest.fn(async (v: any) => ({ id: 1, ...v })),
    delete: jest.fn(),
    count: jest.fn(),
  };
  const userRepo = { findOne: jest.fn() };
  const service = new LevelsService(levelRepo as any, userRepo as any);
  return { service, levelRepo, userRepo };
}

describe('LevelsService.getAllLevels', () => {
  it('returns levels ordered by sort_order ascending', async () => {
    const { service, levelRepo } = createService();
    const rows = [level(0, { sort_order: 0 }), level(50, { sort_order: 1 })];
    levelRepo.find.mockResolvedValue(rows);

    await expect(service.getAllLevels()).resolves.toBe(rows);
    expect(levelRepo.find).toHaveBeenCalledWith({ order: { sort_order: 'ASC' } });
  });

  it('returns an empty array when no levels exist', async () => {
    const { service, levelRepo } = createService();
    levelRepo.find.mockResolvedValue([]);

    await expect(service.getAllLevels()).resolves.toEqual([]);
  });
});

describe('LevelsService.getUserLevel', () => {
  it('throws NotFoundException when the user does not exist', async () => {
    const { service, levelRepo, userRepo } = createService();
    userRepo.findOne.mockResolvedValue(null);

    await expect(service.getUserLevel(7)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getUserLevel(7)).rejects.toThrow('User not found');
    expect(levelRepo.findOne).not.toHaveBeenCalled();
  });

  it('looks up the level whose min_points equals the user total_points', async () => {
    const { service, levelRepo, userRepo } = createService();
    userRepo.findOne.mockResolvedValue({ id: 7, total_points: 120 });
    const hit = level(100);
    levelRepo.findOne.mockResolvedValue(hit);

    await expect(service.getUserLevel(7)).resolves.toBe(hit);
    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { id: 7 },
      select: ['total_points'],
    });
    expect(levelRepo.findOne).toHaveBeenCalledWith({
      where: { min_points: 120 },
      order: { min_points: 'DESC' },
    });
  });

  it('returns null when no level matches the score', async () => {
    const { service, levelRepo, userRepo } = createService();
    userRepo.findOne.mockResolvedValue({ id: 7, total_points: 9999 });
    levelRepo.findOne.mockResolvedValue(null);

    await expect(service.getUserLevel(7)).resolves.toBeNull();
  });
});

describe('LevelsService.getUserLevelInfo', () => {
  it('throws NotFoundException when the user does not exist', async () => {
    const { service, levelRepo, userRepo } = createService();
    userRepo.findOne.mockResolvedValue(null);

    await expect(service.getUserLevelInfo(1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getUserLevelInfo(1)).rejects.toThrow('User not found');
    expect(levelRepo.find).not.toHaveBeenCalled();
  });

  it('rounds progress between two tiers', async () => {
    const { service, levelRepo, userRepo } = createService();
    userRepo.findOne.mockResolvedValue({ id: 1, total_points: 25 });
    levelRepo.find.mockResolvedValue([level(0), level(100)]);

    const info = await service.getUserLevelInfo(1);

    expect(levelRepo.find).toHaveBeenCalledWith({ order: { min_points: 'ASC' } });
    expect(info.level).toEqual(level(0));
    expect(info.progress).toBe(25);
  });

  it('rounds half up instead of truncating', async () => {
    const { service, levelRepo, userRepo } = createService();
    userRepo.findOne.mockResolvedValue({ id: 1, total_points: 101 });
    levelRepo.find.mockResolvedValue([level(0), level(200)]);

    // 101 / 200 * 100 = 50.5 -> 51, a truncating implementation would give 50.
    await expect(service.getUserLevelInfo(1)).resolves.toEqual({ level: level(0), progress: 51 });
  });

  it('treats an exact tier boundary as reaching that tier', async () => {
    const { service, levelRepo, userRepo } = createService();
    userRepo.findOne.mockResolvedValue({ id: 1, total_points: 200 });
    levelRepo.find.mockResolvedValue([level(0), level(200), level(500)]);

    const info = await service.getUserLevelInfo(1);

    expect(info.level).toEqual(level(200));
    expect(info.progress).toBe(0);
  });

  it('reports 100 when the highest tier is reached', async () => {
    const { service, levelRepo, userRepo } = createService();
    userRepo.findOne.mockResolvedValue({ id: 1, total_points: 5000 });
    levelRepo.find.mockResolvedValue([level(0), level(500), level(1000)]);

    const info = await service.getUserLevelInfo(1);

    expect(info.level).toEqual(level(1000));
    expect(info.progress).toBe(100);
  });

  it('reports 100 when there is only one (lowest) tier', async () => {
    const { service, levelRepo, userRepo } = createService();
    userRepo.findOne.mockResolvedValue({ id: 1, total_points: 10 });
    levelRepo.find.mockResolvedValue([level(0)]);

    await expect(service.getUserLevelInfo(1)).resolves.toEqual({ level: level(0), progress: 100 });
  });

  it('returns a null level and 100 progress when no tiers are configured', async () => {
    const { service, levelRepo, userRepo } = createService();
    userRepo.findOne.mockResolvedValue({ id: 1, total_points: 10 });
    levelRepo.find.mockResolvedValue([]);

    await expect(service.getUserLevelInfo(1)).resolves.toEqual({ level: null, progress: 100 });
  });

  it('keeps the lowest tier for a user below every threshold', async () => {
    const { service, levelRepo, userRepo } = createService();
    userRepo.findOne.mockResolvedValue({ id: 1, total_points: 0 });
    levelRepo.find.mockResolvedValue([level(0), level(50)]);

    await expect(service.getUserLevelInfo(1)).resolves.toEqual({ level: level(0), progress: 0 });
  });
});

describe('LevelsService.createLevel', () => {
  it('creates and saves the level', async () => {
    const { service, levelRepo } = createService();
    const data = { name: '新手', slug: 'novice', min_points: 0, sort_order: 0 };

    const saved = await service.createLevel(data);

    expect(levelRepo.create).toHaveBeenCalledWith(data);
    expect(levelRepo.save).toHaveBeenCalledWith(data);
    expect(saved).toEqual({ id: 1, ...data });
  });
});

describe('LevelsService.updateLevel', () => {
  it('merges the patch into the stored level and saves it', async () => {
    const { service, levelRepo } = createService();
    const existing = level(0, { name: '新手' });
    levelRepo.findOne.mockResolvedValue(existing);

    const saved = await service.updateLevel(existing.id, { name: '入门' } as any);

    expect(levelRepo.findOne).toHaveBeenCalledWith({ where: { id: existing.id } });
    expect(saved.name).toBe('入门');
    expect(saved.min_points).toBe(0);
    expect(levelRepo.save).toHaveBeenCalledWith(existing);
  });

  it('throws NotFoundException when the level is missing', async () => {
    const { service, levelRepo } = createService();
    levelRepo.findOne.mockResolvedValue(null);

    await expect(service.updateLevel(99, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateLevel(99, { name: 'x' })).rejects.toThrow('等级不存在');
    expect(levelRepo.save).not.toHaveBeenCalled();
  });
});

describe('LevelsService.deleteLevel', () => {
  it('deletes an existing level', async () => {
    const { service, levelRepo } = createService();
    levelRepo.delete.mockResolvedValue({ affected: 1 });

    await expect(service.deleteLevel(3)).resolves.toBeUndefined();
    expect(levelRepo.delete).toHaveBeenCalledWith(3);
  });

  it('throws NotFoundException when nothing was deleted', async () => {
    const { service, levelRepo } = createService();
    levelRepo.delete.mockResolvedValue({ affected: 0 });

    await expect(service.deleteLevel(3)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteLevel(3)).rejects.toThrow('等级不存在');
  });
});

describe('LevelsService.initializeDefaultLevels', () => {
  it('does nothing when levels already exist', async () => {
    const { service, levelRepo } = createService();
    levelRepo.count.mockResolvedValue(3);

    await service.initializeDefaultLevels();

    expect(levelRepo.count).toHaveBeenCalled();
    expect(levelRepo.save).not.toHaveBeenCalled();
  });

  it('seeds the five default tiers in order when the table is empty', async () => {
    const { service, levelRepo } = createService();
    levelRepo.count.mockResolvedValue(0);

    await service.initializeDefaultLevels();

    const saved = levelRepo.save.mock.calls.map((c) => c[0]);
    expect(saved.map((l: any) => l.slug)).toEqual([
      'novice',
      'active',
      'core',
      'elite',
      'master',
    ]);
    expect(saved.map((l: any) => l.min_points)).toEqual([0, 50, 200, 500, 1000]);
    expect(saved.map((l: any) => l.sort_order)).toEqual([0, 1, 2, 3, 4]);
  });
});

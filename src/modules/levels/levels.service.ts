import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Level } from '@entities/level.entity';
import { User } from '@entities/user.entity';

@Injectable()
export class LevelsService {
  constructor(
    @InjectRepository(Level)
    private levelRepo: Repository<Level>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async getAllLevels(): Promise<Level[]> {
    return this.levelRepo.find({ order: { sort_order: 'ASC' } });
  }

  async getUserLevel(userId: number): Promise<Level | null> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['total_points'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.levelRepo.findOne({
      where: { min_points: user.total_points },
      order: { min_points: 'DESC' },
    });
  }

  async getUserLevelInfo(userId: number): Promise<{ level: Level | null; progress: number }> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['total_points'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const allLevels = await this.levelRepo.find({ order: { min_points: 'ASC' } });
    let currentLevel: Level | null = null;
    let nextLevel: Level | null = null;

    for (const level of allLevels) {
      if (user.total_points >= level.min_points) {
        currentLevel = level;
      } else {
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

  async createLevel(data: Partial<Level>): Promise<Level> {
    const level = this.levelRepo.create(data);
    return this.levelRepo.save(level);
  }

  async updateLevel(id: number, data: Partial<Level>): Promise<Level> {
    const level = await this.levelRepo.findOne({ where: { id } });
    if (!level) {
      throw new NotFoundException('等级不存在');
    }
    Object.assign(level, data);
    return this.levelRepo.save(level);
  }

  async deleteLevel(id: number): Promise<void> {
    const result = await this.levelRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('等级不存在');
    }
  }

  async initializeDefaultLevels(): Promise<void> {
    const existing = await this.levelRepo.count();
    if (existing > 0) return;

    const defaults = [
      { name: '新手', slug: 'novice', min_points: 0, max_points: 49, color: '#9ca3af', description: '刚加入社区', sort_order: 0 },
      { name: '活跃', slug: 'active', min_points: 50, max_points: 199, color: '#3b82f6', description: '积极参与讨论', sort_order: 1 },
      { name: '核心', slug: 'core', min_points: 200, max_points: 499, color: '#8b5cf6', description: '社区核心成员', sort_order: 2 },
      { name: '精英', slug: 'elite', min_points: 500, max_points: 999, color: '#f59e0b', description: '社区精英', sort_order: 3 },
      { name: '大师', slug: 'master', min_points: 1000, max_points: undefined as any, color: '#ef4444', description: '社区大师', sort_order: 4 },
    ];

    for (const d of defaults) {
      await this.levelRepo.save(this.levelRepo.create(d));
    }
  }
}

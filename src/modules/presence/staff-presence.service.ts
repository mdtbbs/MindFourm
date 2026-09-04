import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { PresenceService } from './presence.service';

export interface StaffPresenceView {
  id: number;
  username: string;
  avatar_url: string | null;
  role: string;
  status: string;
}

/** Public, deliberately small view model for the forum home page. */
@Injectable()
export class StaffPresenceService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly presence: PresenceService,
  ) {}

  async list(): Promise<StaffPresenceView[]> {
    const staff = await this.users.find({
      where: { role: In(['admin', 'moderator', 'super_admin']) },
      select: ['id', 'username', 'avatar_url', 'role'],
      order: { role: 'ASC', username: 'ASC' },
      take: 24,
    });
    const presences = await this.presence.getPresences(staff.map((user) => user.id));

    return staff.map((user) => ({
      id: user.id,
      username: user.username,
      avatar_url: user.avatar_url,
      role: user.role,
      status: presences.get(user.id)?.status || 'offline',
    }));
  }
}

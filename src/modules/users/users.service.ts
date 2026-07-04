import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Post } from '../../entities/post.entity';
import { Reply } from '../../entities/reply.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { escapeLike } from '@common/utils/search.util';
import { SettingsService } from '../settings/settings.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(Reply)
    private replyRepository: Repository<Reply>,
    private settingsService: SettingsService,
  ) {}

  private async deleteLocalAvatar(avatarUrl?: string | null): Promise<void> {
    if (!avatarUrl?.startsWith('/uploads/avatars/')) return;

    const filePath = path.resolve(`.${avatarUrl}`);
    await fs.unlink(filePath).catch(() => undefined);
  }

  async getById(id: number): Promise<User & { post_count?: number; reply_count?: number }> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    // Get post count via subquery
    const postCountResult = await this.postRepository
      .createQueryBuilder('post')
      .select('COUNT(*)', 'count')
      .where('post.user_id = :userId', { userId: id })
      .getRawOne();

    // Get reply count via subquery
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

  async getByMindAuthId(mindauthId: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { mindauth_id: mindauthId } });
  }

  async updateProfile(id: number, dto: UpdateProfileDto): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    if (dto.username !== undefined) {
      user.username = dto.username;
    }

    if (dto.bio !== undefined) {
      user.bio = dto.bio;
    }

    return this.userRepository.save(user);
  }

  async updateAvatar(id: number, avatarUrl: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    if (await this.settingsService.getBoolean('require_avatar_approval', true)) {
      await this.deleteLocalAvatar(user.pending_avatar_url);
      user.pending_avatar_url = avatarUrl;
      user.avatar_status = 'pending';
    } else {
      await this.deleteLocalAvatar(user.avatar_url);
      await this.deleteLocalAvatar(user.pending_avatar_url);
      user.avatar_url = avatarUrl;
      user.pending_avatar_url = null;
      user.avatar_status = 'approved';
    }

    return this.userRepository.save(user);
  }

  async removeAvatar(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    await this.deleteLocalAvatar(user.avatar_url);
    await this.deleteLocalAvatar(user.pending_avatar_url);

    user.avatar_url = null as any;
    user.pending_avatar_url = null;
    user.avatar_status = 'approved';
    return this.userRepository.save(user);
  }

  async getRepliesByUserId(
    userId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ replies: Reply[]; total: number }> {
    const [replies, total] = await this.replyRepository.findAndCount({
      where: { user_id: userId },
      relations: ['post'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { replies, total };
  }

  async updateRole(id: number, role: string): Promise<User> {
    const validRoles = ['user', 'moderator', 'admin'];

    if (!validRoles.includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    user.role = role;
    return this.userRepository.save(user);
  }

  async getAll(
    page: number = 1,
    limit: number = 20,
    search?: string,
  ): Promise<{ users: User[]; total: number }> {
    const queryBuilder = this.userRepository.createQueryBuilder('user');

    if (search) {
      queryBuilder.where('user.username LIKE :search', { search: `%${escapeLike(search)}%` });
    }

    const [users, total] = await queryBuilder
      .orderBy('user.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { users, total };
  }

  async searchByUsername(query: string, limit: number = 10): Promise<User[]> {
    return this.userRepository.find({
      where: { username: Like(`%${escapeLike(query)}%`) },
      take: limit,
      order: { username: 'ASC' },
    });
  }
}

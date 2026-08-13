import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User } from '../../entities/user.entity';
import { Post } from '../../entities/post.entity';
import { Reply } from '../../entities/reply.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { escapeLike } from '@common/utils/search.util';
import { SettingsService } from '../settings/settings.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { POST_STATUS, REPLY_STATUS } from '../../common/utils/constants';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface UserReplyItem {
  id: number;
  post_id: number;
  user_id: number;
  parent_reply_id: number | null;
  content: string;
  content_html: string | null;
  post_title: string | null;
  status: string;
  like_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface UserReplyPage {
  data: UserReplyItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

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
    private adminNotificationsService: AdminNotificationsService,
  ) {}

  private async deleteLocalAvatar(avatarUrl?: string | null): Promise<void> {
    if (!avatarUrl?.startsWith('/uploads/avatars/')) return;

    const filePath = path.resolve(`.${avatarUrl}`);
    await fs.unlink(filePath).catch(() => undefined);
  }

  async getById(id: number): Promise<User & { post_count?: number; reply_count?: number; last_location_label?: string | null }> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    // Get post count via subquery
    const postCountResult = await this.postRepository
      .createQueryBuilder('post')
      .select('COUNT(*)', 'count')
      .where('post.user_id = :userId', { userId: id })
      .andWhere('post.status = :status', { status: POST_STATUS.published })
      .getRawOne();

    // Get public reply count via subquery
    const replyCountResult = await this.replyRepository
      .createQueryBuilder('reply')
      .innerJoin('reply.post', 'post')
      .select('COUNT(*)', 'count')
      .where('reply.user_id = :userId', { userId: id })
      .andWhere('reply.status = :replyStatus', { replyStatus: REPLY_STATUS.published })
      .andWhere('post.status = :postStatus', { postStatus: POST_STATUS.published })
      .getRawOne();

    // A profile may show a coarse province label, never the retained source IP.
    // Prefer the user's latest public post and then their latest public reply.
    const [postLocation, replyLocation] = await Promise.all([
      this.postRepository
        .createQueryBuilder('post')
        .select('post.location_label', 'location_label')
        .where('post.user_id = :userId', { userId: id })
        .andWhere('post.status = :status', { status: POST_STATUS.published })
        .andWhere('post.location_label IS NOT NULL')
        .orderBy('post.created_at', 'DESC')
        .getRawOne(),
      this.replyRepository
        .createQueryBuilder('reply')
        .innerJoin('reply.post', 'post')
        .select('reply.location_label', 'location_label')
        .where('reply.user_id = :userId', { userId: id })
        .andWhere('reply.status = :replyStatus', { replyStatus: REPLY_STATUS.published })
        .andWhere('post.status = :postStatus', { postStatus: POST_STATUS.published })
        .andWhere('reply.location_label IS NOT NULL')
        .orderBy('reply.created_at', 'DESC')
        .getRawOne(),
    ]);

    return {
      ...user,
      post_count: parseInt(postCountResult.count, 10),
      reply_count: parseInt(replyCountResult.count, 10),
      last_location_label: postLocation?.location_label || replyLocation?.location_label || null,
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

    const savedUser = await this.userRepository.save(user);

    if (savedUser.avatar_status === 'pending') {
      this.adminNotificationsService.publishModerationPending({
        item_type: 'avatar',
        item_id: savedUser.id,
        title: null,
        content: savedUser.pending_avatar_url,
        author_username: savedUser.username || `#${savedUser.id}`,
        action_url: '/admin/content/moderation?type=avatars',
      }).catch((err) =>
        console.error('Admin avatar moderation notification error:', err),
      );
    }

    return savedUser;
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
  ): Promise<UserReplyPage> {
    const currentPage = Math.max(1, Number(page) || 1);
    const cappedLimit = Math.min(50, Math.max(1, Number(limit) || 20));

    const [replies, total] = await this.replyRepository
      .createQueryBuilder('reply')
      .innerJoinAndSelect('reply.post', 'post')
      .select([
        'reply.id',
        'reply.post_id',
        'reply.user_id',
        'reply.parent_reply_id',
        'reply.content',
        'reply.content_html',
        'reply.status',
        'reply.like_count',
        'reply.created_at',
        'reply.updated_at',
        'post.id',
        'post.title',
      ])
      .where('reply.user_id = :userId', { userId })
      .andWhere('reply.status = :replyStatus', { replyStatus: REPLY_STATUS.published })
      .andWhere('post.status = :postStatus', { postStatus: POST_STATUS.published })
      .orderBy('reply.created_at', 'DESC')
      .skip((currentPage - 1) * cappedLimit)
      .take(cappedLimit)
      .getManyAndCount();

    return {
      data: replies.map((reply) => ({
        id: reply.id,
        post_id: reply.post_id,
        user_id: reply.user_id,
        parent_reply_id: reply.parent_reply_id,
        content: reply.content,
        content_html: reply.content_html,
        post_title: reply.post?.title ?? null,
        status: reply.status,
        like_count: reply.like_count,
        created_at: reply.created_at,
        updated_at: reply.updated_at,
      })),
      pagination: {
        page: currentPage,
        limit: cappedLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / cappedLimit)),
      },
    };
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

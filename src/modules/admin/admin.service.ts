import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { Post, User, Category, Tag, PostTag, Ban, Setting, OperationLog, Reply } from '@entities/index';
import { StatsService } from '../stats/stats.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { BansService } from '../bans/bans.service';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import { PointsService } from '../points/points.service';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(Reply)
    private replyRepository: Repository<Reply>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
    @InjectRepository(PostTag)
    private postTagRepository: Repository<PostTag>,
    @InjectRepository(Ban)
    private banRepository: Repository<Ban>,
    @InjectRepository(Setting)
    private settingRepository: Repository<Setting>,
    @InjectRepository(OperationLog)
    private operationLogRepository: Repository<OperationLog>,
    private dataSource: DataSource,
    private statsService: StatsService,
    private settingsService: SettingsService,
    private logsService: LogsService,
    private bansService: BansService,
    private categoriesService: CategoriesService,
    private tagsService: TagsService,
    private pointsService: PointsService,
  ) {}

  private async deleteLocalAvatar(avatarUrl?: string | null): Promise<void> {
    if (!avatarUrl?.startsWith('/uploads/avatars/')) return;
    await fs.unlink(path.resolve(`.${avatarUrl}`)).catch(() => undefined);
  }

  /**
   * Get dashboard statistics (delegate to StatsService)
   */
  async getStats() {
    return this.statsService.getDashboardStats();
  }

  /**
   * Get moderation badge counts
   */
  async getBadgeCounts(): Promise<{
    pending_posts: number;
    pending_replies: number;
    pending_avatars: number;
    show_announce: boolean;
  }> {
    const pending_posts = await this.postRepository.count({
      where: { status: 'pending' },
    });

    const pending_replies = await this.replyRepository.count({
      where: { status: 'pending' },
    });
    const pending_avatars = await this.userRepository.count({
      where: { avatar_status: 'pending' },
    });

    const announce_setting = await this.settingsService.get('show_announcement');
    const show_announce = announce_setting === 'true';

    return {
      pending_posts,
      pending_replies,
      pending_avatars,
      show_announce,
    };
  }

  /**
   * Get posts with JOINs for admin management
   */
  async getPosts(query: {
    page: number;
    limit: number;
    status?: string;
    category_id?: number;
  }): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, status, category_id } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (category_id) where.category_id = category_id;

    const [data, total] = await this.postRepository.findAndCount({
      where,
      relations: ['user', 'category'],
      select: {
        id: true,
        user_id: true,
        category_id: true,
        title: true,
        status: true,
        is_pinned: true,
        view_count: true,
        like_count: true,
        created_at: true,
        updated_at: true,
        user: {
          id: true,
          username: true,
          email: true,
        },
        category: {
          id: true,
          name: true,
        },
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Bulk delete posts (soft delete in transaction)
   */
  async bulkDeletePosts(postIds: number[]): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      for (const postId of postIds) {
        await manager.softDelete(Post, postId);
      }
    });
  }

  /**
   * Bulk pin posts
   */
  async bulkPinPosts(postIds: number[], isPinned: number): Promise<void> {
    await this.postRepository.update(postIds, { is_pinned: isPinned });
  }

  /**
   * Bulk move posts to a different category
   */
  async bulkMovePosts(postIds: number[], categoryId: number): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    await this.postRepository.update(postIds, { category_id: categoryId });
  }

  /**
   * Pin a single post
   */
  async pinPost(id: number, isPinned: number): Promise<Post> {
    await this.postRepository.update(id, { is_pinned: isPinned });

    const post = await this.postRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  /**
   * Move a single post to a different category
   */
  async movePost(id: number, categoryId: number): Promise<Post> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    await this.postRepository.update(id, { category_id: categoryId });

    const post = await this.postRepository.findOne({
      where: { id },
      relations: ['user', 'category'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  /**
   * Get moderation queue (pending posts and replies)
   */
  async getModerationQueue(type: string, page: number, limit: number): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    if (type === 'posts' || type === 'post' || type === 'all') {
      const [data, total] = await this.postRepository.findAndCount({
        where: { status: 'pending' },
        relations: ['user', 'category'],
        order: { created_at: 'ASC' },
        skip,
        take: limit,
      });

      const totalPages = Math.ceil(total / limit);

      return {
        data: data.map((item) => ({
          id: item.id,
          item_type: 'post',
          title: item.title,
          content: item.content,
          author_username: item.user?.username || '',
          created_at: item.created_at,
        })),
        total,
        page,
        limit,
        totalPages,
      };
    } else if (type === 'replies' || type === 'reply') {
      const [data, total] = await this.replyRepository.findAndCount({
        where: { status: 'pending' },
        relations: ['user', 'post'],
        order: { created_at: 'ASC' },
        skip,
        take: limit,
      });

      const totalPages = Math.ceil(total / limit);

      return {
        data: data.map((item) => ({
          id: item.id,
          item_type: 'reply',
          content: item.content,
          author_username: item.user?.username || '',
          created_at: item.created_at,
          post_id: item.post_id,
        })),
        total,
        page,
        limit,
        totalPages,
      };
    } else if (type === 'avatars' || type === 'avatar') {
      const [data, total] = await this.userRepository.findAndCount({
        where: { avatar_status: 'pending' },
        order: { updated_at: 'ASC' },
        skip,
        take: limit,
      });

      const totalPages = Math.ceil(total / limit);

      return {
        data: data.map((item) => ({
          id: item.id,
          item_type: 'avatar',
          content: item.pending_avatar_url || '',
          author_username: item.username || '',
          created_at: item.updated_at,
          avatar_url: item.pending_avatar_url,
        })),
        total,
        page,
        limit,
        totalPages,
      };
    }

    return {
      data: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
    };
  }

  /**
   * Approve a post (set status to published)
   */
  async approvePost(id: number): Promise<void> {
    const post = await this.postRepository.findOne({ where: { id } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    await this.postRepository.update(id, { status: 'published' });
    if (post.status !== 'published') {
      await this.pointsService.awardPoints(post.user_id, 'create_post', 'post', post.id);
    }
  }

  /**
   * Reject a post (set status to deleted)
   */
  async rejectPost(id: number): Promise<void> {
    await this.postRepository.update(id, { status: 'deleted' });
  }

  async approveReply(id: number): Promise<void> {
    const reply = await this.replyRepository.findOne({ where: { id } });
    if (!reply) {
      throw new NotFoundException('Reply not found');
    }
    await this.replyRepository.update(id, { status: 'published' });
    if (reply.status !== 'published') {
      await this.pointsService.awardPoints(reply.user_id, 'create_reply', 'reply', reply.id);
    }
  }

  async rejectReply(id: number): Promise<void> {
    await this.replyRepository.update(id, { status: 'deleted', deleted_at: new Date() });
  }

  async approveAvatar(userId: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.pending_avatar_url) {
      throw new BadRequestException('No pending avatar');
    }
    await this.deleteLocalAvatar(user.avatar_url);
    user.avatar_url = user.pending_avatar_url;
    user.pending_avatar_url = null;
    user.avatar_status = 'approved';
    await this.userRepository.save(user);
  }

  async rejectAvatar(userId: number): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.deleteLocalAvatar(user.pending_avatar_url);
    await this.userRepository.update(userId, {
      pending_avatar_url: null,
      avatar_status: 'rejected',
    });
  }

  async approveModerationItem(type: string, id: number): Promise<void> {
    if (type === 'reply' || type === 'replies') return this.approveReply(id);
    if (type === 'avatar' || type === 'avatars') return this.approveAvatar(id);
    return this.approvePost(id);
  }

  async rejectModerationItem(type: string, id: number): Promise<void> {
    if (type === 'reply' || type === 'replies') return this.rejectReply(id);
    if (type === 'avatar' || type === 'avatars') return this.rejectAvatar(id);
    return this.rejectPost(id);
  }

  /**
   * Merge two tags (move post_tags, delete source tag)
   */
  async mergeTags(fromId: number, toId: number): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      // Verify both tags exist
      const fromTag = await manager.findOne(Tag, { where: { id: fromId } });
      const toTag = await manager.findOne(Tag, { where: { id: toId } });

      if (!fromTag || !toTag) {
        throw new NotFoundException('Tag not found');
      }

      // Move all post_tags from source to target
      await manager.query(
        'UPDATE post_tags SET tag_id = ? WHERE tag_id = ?',
        [toId, fromId],
      );

      // Delete the source tag
      await manager.delete(Tag, fromId);
    });
  }

  /**
   * Cleanup old operation logs based on retention setting
   */
  async cleanupLogs(): Promise<number> {
    const retentionDays = await this.settingsService.getNumber('cleanup_log_retention_days');
    const days = retentionDays || 365;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.operationLogRepository.delete({
      created_at: LessThan(cutoffDate),
    });

    return result.affected || 0;
  }

  /**
   * Cleanup soft-deleted posts and replies (hard delete old items)
   */
  async cleanupSoftDeleted(): Promise<number> {
    const retentionDays = await this.settingsService.getNumber('cleanup_soft_delete_retention_days');
    const days = retentionDays || 30;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let count = 0;

    // Hard delete old soft-deleted posts
    const postsResult = await this.postRepository.createQueryBuilder()
      .delete()
      .where('deleted_at < :cutoffDate', { cutoffDate })
      .execute();

    count += postsResult.affected || 0;

    // Hard delete old soft-deleted replies
    const repliesResult = await this.replyRepository.createQueryBuilder()
      .delete()
      .where('deleted_at < :cutoffDate', { cutoffDate })
      .execute();

    count += repliesResult.affected || 0;

    return count;
  }
}

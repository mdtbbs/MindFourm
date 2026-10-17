import { Injectable, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { Post, User, Category, Tag, PostTag, Ban, Setting, OperationLog, Reply, SessionAudit } from '@entities/index';
import { StatsService } from '../stats/stats.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { BansService } from '../bans/bans.service';
import { CategoriesService } from '../categories/categories.service';
import { TagsService } from '../tags/tags.service';
import { PointsService } from '../points/points.service';
import { RedisService } from '../../database/redis.service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventsService } from '../events/events.service';
import { PostActivityService } from '../posts/post-activity.service';
import { postDetailCacheKey } from '@common/utils/post-cache.util';

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
    @InjectRepository(SessionAudit)
    private sessionAuditRepository: Repository<SessionAudit>,
    private dataSource: DataSource,
    private statsService: StatsService,
    private settingsService: SettingsService,
    private logsService: LogsService,
    private bansService: BansService,
    private categoriesService: CategoriesService,
    private tagsService: TagsService,
    private pointsService: PointsService,
    private redisService: RedisService,
    private postActivityService: PostActivityService,
    @Optional() private events?: EventsService,
  ) {}

  private async deleteLocalAvatar(avatarUrl?: string | null): Promise<void> {
    if (!avatarUrl?.startsWith('/uploads/avatars/')) return;
    await fs.unlink(path.resolve(`.${avatarUrl}`)).catch(() => undefined);
  }

  /**
   * Get dashboard statistics (delegate to StatsService)
   */
  async getStats(rangeDays: 1 | 7 | 30 | 90 = 7) {
    return this.statsService.getDashboardStats(rangeDays);
  }

  /**
   * Get moderation badge counts
   */
  async getBadgeCounts(): Promise<{
    moderation_pending: number;
    announce_active: number;
    pending_posts: number;
    pending_replies: number;
    pending_avatars: number;
    show_announce: boolean;
  }> {
    const [pending_posts, pending_replies, pending_avatars, announceEnabled, legacyAnnounceSetting] =
      await Promise.all([
        this.postRepository.count({
          where: { status: 'pending' },
        }),
        this.replyRepository.count({
          where: { status: 'pending' },
        }),
        this.userRepository.count({
          where: { avatar_status: 'pending' },
        }),
        this.settingsService.get('announce_enabled'),
        this.settingsService.get('show_announcement'),
      ]);

    const show_announce = announceEnabled === 'true'
      || (announceEnabled === null && legacyAnnounceSetting === 'true');

    return {
      moderation_pending: pending_posts + pending_replies + pending_avatars,
      announce_active: show_announce ? 1 : 0,
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
    // `Repository.update([], ...)` raises TypeORM's "Empty criteria(s) are not
    // allowed" instead of updating nothing, so an empty selection must
    // short-circuit rather than reach the query builder.
    if (postIds.length === 0) {
      return;
    }
    await this.postRepository.update(postIds, { is_pinned: this.normalizePinnedValue(isPinned) });
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

    // See bulkPinPosts — empty criteria is a TypeORM error, not a no-op.
    if (postIds.length === 0) {
      return;
    }

    await this.postRepository.update(postIds, { category_id: categoryId });
  }

  /**
   * Pin a single post
   */
  async pinPost(id: number, isPinned: number): Promise<Post> {
    await this.postRepository.update(id, { is_pinned: this.normalizePinnedValue(isPinned) });

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
   * Get pending moderation items, optionally merged across posts, replies, and avatars.
   */
  async getModerationQueue(type: string, page: number, limit: number): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    if (type === 'all') {
      // The dashboard badge is the sum of these three moderation queues, so the
      // default workbench view must return the same set instead of posts only.
      // Fetch each queue through the requested global offset, then merge by
      // submission time before slicing the combined page.
      const take = skip + limit;
      const [posts, replies, avatars] = await Promise.all([
        this.postRepository.findAndCount({
          where: { status: 'pending' },
          relations: ['user', 'category'],
          order: { created_at: 'ASC' },
          take,
        }),
        this.replyRepository.findAndCount({
          where: { status: 'pending' },
          relations: ['user', 'post'],
          order: { created_at: 'ASC' },
          take,
        }),
        this.userRepository.findAndCount({
          where: { avatar_status: 'pending' },
          order: { updated_at: 'ASC' },
          take,
        }),
      ]);

      const combined = [
        ...posts[0].map((item) => ({
          id: item.id,
          item_type: 'post',
          title: item.title,
          content: item.content,
          author_username: item.user?.username || '',
          created_at: item.created_at,
        })),
        ...replies[0].map((item) => ({
          id: item.id,
          item_type: 'reply',
          content: item.content,
          author_username: item.user?.username || '',
          created_at: item.created_at,
          post_id: item.post_id,
        })),
        ...avatars[0].map((item) => ({
          id: item.id,
          item_type: 'avatar',
          content: item.pending_avatar_url || '',
          author_username: item.username || '',
          created_at: item.updated_at,
          avatar_url: item.pending_avatar_url,
        })),
      ].sort((left, right) => {
        const dateOrder = left.created_at.getTime() - right.created_at.getTime();
        if (dateOrder !== 0) return dateOrder;
        const typeOrder = left.item_type.localeCompare(right.item_type);
        return typeOrder || left.id - right.id;
      });
      const total = posts[1] + replies[1] + avatars[1];

      return {
        data: combined.slice(skip, skip + limit),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    if (type === 'posts' || type === 'post') {
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
    if (this.events) {
      await this.dataSource.transaction(async manager => {
        const post = await manager.findOne(Post, { where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!post) throw new NotFoundException('Post not found');
        if (post.status === 'published') return;
        await manager.update(Post, id, { status: 'published' });
        await this.events!.publish({ eventKey: 'ForumPostPublished', aggregateType: 'Post', aggregateId: id,
          payload: { post_id: id },
        }, manager);
      });
      await this.invalidatePostCache(id).catch(error => console.warn('Approved post cache invalidation failed:', error.message));
      return;
    }
    const post = await this.postRepository.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Post not found');
    await this.postRepository.update(id, { status: 'published' });
    await this.invalidatePostCache(id);
    if (post.status !== 'published') await this.pointsService.awardPoints(post.user_id, 'create_post', 'post', post.id).catch(error => console.warn('Approved post points failed after commit:', error.message));
  }

  /**
   * Reject a post (set status to deleted)
   */
  async rejectPost(id: number, reason?: string | null): Promise<void> {
    // `deleted_at` has to be stamped alongside the status: `cleanupSoftDeleted`
    // purges on `deleted_at < cutoff`, so a rejected post with a NULL timestamp
    // is retained forever. `rejectReply` already does this.
    const updateData: any = { status: 'deleted', deleted_at: new Date() };
    if (reason) updateData.reject_reason = reason;
    await this.postRepository.update(id, updateData);
    await this.invalidatePostCache(id);
  }

  async approveReply(id: number): Promise<void> {
    if (this.events) {
      const reply = await this.dataSource.transaction(async (manager) => {
        const row = await manager.findOne(Reply, { where: { id }, lock: { mode: 'pessimistic_write' } });
        if (!row) throw new NotFoundException('Reply not found');
        if (row.status === 'published') return row;
        await manager.update(Reply, id, { status: 'published' });
        await this.events!.publish({ eventKey: 'ForumReplyPublished', aggregateType: 'Reply', aggregateId: id, payload: { reply_id: id } }, manager);
        return row;
      });
      await this.invalidatePostCache(reply.post_id).catch((error) => console.warn('Approved reply cache invalidation failed:', error.message));
      return;
    }
    // Compatibility with isolated embedders that do not install the events module.
    const reply = await this.replyRepository.findOne({ where: { id } });
    if (!reply) throw new NotFoundException('Reply not found');
    await this.replyRepository.update(id, { status: 'published' });
    try {
      await this.postActivityService.markPostActive(reply.post_id);
      await this.invalidatePostCache(reply.post_id);
      if (reply.status !== 'published') await this.pointsService.awardPoints(reply.user_id, 'create_reply', 'reply', reply.id);
    } catch (error) { console.warn('Approved reply effects failed after commit:', (error as Error).message); }
  }

  async rejectReply(id: number): Promise<void> {
    const reply = await this.replyRepository.findOne({ where: { id } });
    await this.replyRepository.update(id, { status: 'deleted', deleted_at: new Date() });
    if (reply) {
      if (reply.status === 'published') {
        await this.postActivityService.recalculatePostActivity(reply.post_id);
      }
      await this.invalidatePostCache(reply.post_id);
    }
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

  async rejectModerationItem(type: string, id: number, reason?: string | null): Promise<void> {
    if (type === 'reply' || type === 'replies') return this.rejectReply(id);
    if (type === 'avatar' || type === 'avatars') return this.rejectAvatar(id);
    return this.rejectPost(id, reason);
  }

  /**
   * Drop the post's derived cache after a moderation decision.
   *
   * This used to delete a hard-coded `post:detail:v4:` key while the reader had
   * moved on to v6, so approving or rejecting a post — the exact case where the
   * cached payload becomes wrong — left the stale copy serving for its full TTL.
   * The key now comes from `post-cache.util.ts` so a version bump cannot strand it
   * again, and `post:view:` (a throttle, not derived data) is no longer cleared.
   */
  private async invalidatePostCache(postId: number): Promise<void> {
    await this.redisService.del(`post:${postId}`);
    await this.redisService.del(postDetailCacheKey(postId));
  }

  private normalizePinnedValue(value: number | boolean | null | undefined): 0 | 1 {
    return value ? 1 : 0;
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
   * Prune old session audit rows.
   *
   * The Redis session keys themselves carry a TTL and expire on their own, so there
   * is nothing to sweep there — but `session_audit` grows without bound, one row per
   * login and logout, and holds a hashed token plus an IP address. The endpoint that
   * called this used to return "Sessions cleaned up" without doing anything at all.
   */
  async cleanupSessions(): Promise<number> {
    const retentionDays = await this.settingsService.getNumber('cleanup_session_retention_days');
    const days = retentionDays || 30;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.sessionAuditRepository.delete({
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

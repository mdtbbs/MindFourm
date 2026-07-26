import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PostLike } from '@entities/post-like.entity';
import { ReplyLike } from '@entities/reply-like.entity';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PointsService } from '../points/points.service';

@Injectable()
export class LikesService {
  constructor(
    @InjectRepository(PostLike)
    private postLikeRepo: Repository<PostLike>,
    @InjectRepository(ReplyLike)
    private replyLikeRepo: Repository<ReplyLike>,
    @InjectRepository(Post)
    private postRepo: Repository<Post>,
    @InjectRepository(Reply)
    private replyRepo: Repository<Reply>,
    private notificationsService: NotificationsService,
    private pointsService: PointsService,
    private dataSource: DataSource,
  ) {}

  async likePost(userId: number, postId: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let authorId: number | null = null;
    try {
      const post = await queryRunner.manager.findOne(Post, { where: { id: postId } });
      if (!post) throw new NotFoundException('Post not found');

      const existing = await queryRunner.manager.findOne(PostLike, {
        where: { user_id: userId, post_id: postId },
      });
      if (existing) throw new BadRequestException('Already liked');

      await queryRunner.manager.save(PostLike, { user_id: userId, post_id: postId });
      await queryRunner.manager.increment(Post, { id: postId }, 'like_count', 1);

      authorId = post.user_id === userId ? null : post.user_id;

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    // The notification and the point award both write on connections of their own —
    // `awardPoints` opens its own transaction — so they cannot be rolled back with
    // this one. Running them before the commit meant a like that failed to persist
    // still paid the author and notified them.
    if (authorId !== null) {
      await this.creditLike(authorId, userId, 'post_like', 'post', postId);
    }
  }

  async unlikePost(userId: number, postId: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const like = await queryRunner.manager.findOne(PostLike, {
        where: { user_id: userId, post_id: postId },
      });
      if (!like) throw new BadRequestException('Not liked');

      await queryRunner.manager.delete(PostLike, { user_id: userId, post_id: postId });
      await queryRunner.manager.decrement(Post, { id: postId }, 'like_count', 1);
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async isPostLiked(userId: number, postId: number): Promise<boolean> {
    const like = await this.postLikeRepo.findOne({
      where: { user_id: userId, post_id: postId },
    });
    return !!like;
  }

  async getPostLikeCount(postId: number): Promise<number> {
    const post = await this.postRepo.findOne({ where: { id: postId }, select: ['like_count'] });
    return post?.like_count || 0;
  }

  async getUserLikedPosts(userId: number, page: number, limit: number) {
    const [posts, total] = await this.postRepo
      .createQueryBuilder('p')
      .innerJoin(PostLike, 'pl', 'pl.post_id = p.id AND pl.user_id = :userId', { userId })
      .leftJoin('p.user', 'u')
      .leftJoin('p.category', 'c')
      .orderBy('p.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { posts, total };
  }

  async likeReply(userId: number, replyId: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let authorId: number | null = null;
    try {
      const reply = await queryRunner.manager.findOne(Reply, { where: { id: replyId } });
      if (!reply) throw new NotFoundException('Reply not found');

      const existing = await queryRunner.manager.findOne(ReplyLike, {
        where: { user_id: userId, reply_id: replyId },
      });
      if (existing) throw new BadRequestException('Already liked');

      await queryRunner.manager.save(ReplyLike, { user_id: userId, reply_id: replyId });
      await queryRunner.manager.increment(Reply, { id: replyId }, 'like_count', 1);

      authorId = reply.user_id === userId ? null : reply.user_id;

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }

    if (authorId !== null) {
      await this.creditLike(authorId, userId, 'reply_like', 'reply', replyId);
    }
  }

  /**
   * Notify and reward the author of a liked item.
   *
   * Runs only after the like has been committed. Both operations write on their own
   * connections — `awardPoints` opens its own transaction — so neither participates
   * in the caller's transaction and neither can be rolled back with it. Failures are
   * swallowed: the like itself is already durable, and losing a notification must not
   * turn a successful action into an error for the user.
   */
  private async creditLike(
    recipientId: number,
    actorId: number,
    notificationType: 'post_like' | 'reply_like',
    targetType: 'post' | 'reply',
    targetId: number,
  ): Promise<void> {
    try {
      await this.notificationsService.create({
        user_id: recipientId,
        type: notificationType,
        actor_id: actorId,
        ...(targetType === 'post' ? { post_id: targetId } : { reply_id: targetId }),
      });
    } catch (error) {
      console.error(`Like notification failed for ${targetType} ${targetId}:`, error);
    }

    try {
      await this.pointsService.awardPoints(recipientId, 'receive_like', targetType, targetId);
    } catch (error) {
      console.error(`Like point award failed for ${targetType} ${targetId}:`, error);
    }
  }

  async unlikeReply(userId: number, replyId: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const like = await queryRunner.manager.findOne(ReplyLike, {
        where: { user_id: userId, reply_id: replyId },
      });
      if (!like) throw new BadRequestException('Not liked');

      await queryRunner.manager.delete(ReplyLike, { user_id: userId, reply_id: replyId });
      await queryRunner.manager.decrement(Reply, { id: replyId }, 'like_count', 1);
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  }

  async isReplyLiked(userId: number, replyId: number): Promise<boolean> {
    const like = await this.replyLikeRepo.findOne({
      where: { user_id: userId, reply_id: replyId },
    });
    return !!like;
  }

  async getReplyLikeCount(replyId: number): Promise<number> {
    const reply = await this.replyRepo.findOne({ where: { id: replyId }, select: ['like_count'] });
    return reply?.like_count || 0;
  }

  async getUserReceivedLikeCount(userId: number): Promise<number> {
    const postResult = await this.postRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.like_count), 0)', 'total')
      .where('p.user_id = :userId', { userId })
      .getRawOne();
    const replyResult = await this.replyRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.like_count), 0)', 'total')
      .where('r.user_id = :userId', { userId })
      .getRawOne();
    return Math.floor(postResult?.total || 0) + Math.floor(replyResult?.total || 0);
  }
}

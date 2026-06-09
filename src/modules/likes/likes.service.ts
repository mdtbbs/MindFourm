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
    try {
      const post = await queryRunner.manager.findOne(Post, { where: { id: postId } });
      if (!post) throw new NotFoundException('Post not found');

      const existing = await queryRunner.manager.findOne(PostLike, {
        where: { user_id: userId, post_id: postId },
      });
      if (existing) throw new BadRequestException('Already liked');

      await queryRunner.manager.save(PostLike, { user_id: userId, post_id: postId });
      await queryRunner.manager.increment(Post, { id: postId }, 'like_count', 1);

      if (post.user_id !== userId) {
        await this.notificationsService.create({
          user_id: post.user_id,
          type: 'post_like',
          actor_id: userId,
          post_id: postId,
        });

        // Award points to post author for receiving a like
        await this.pointsService.awardPoints(post.user_id, 'receive_like', 'post', postId);
      }
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
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
    try {
      const reply = await queryRunner.manager.findOne(Reply, { where: { id: replyId } });
      if (!reply) throw new NotFoundException('Reply not found');

      const existing = await queryRunner.manager.findOne(ReplyLike, {
        where: { user_id: userId, reply_id: replyId },
      });
      if (existing) throw new BadRequestException('Already liked');

      await queryRunner.manager.save(ReplyLike, { user_id: userId, reply_id: replyId });
      await queryRunner.manager.increment(Reply, { id: replyId }, 'like_count', 1);

      if (reply.user_id !== userId) {
        await this.notificationsService.create({
          user_id: reply.user_id,
          type: 'reply_like',
          actor_id: userId,
          reply_id: replyId,
        });

        // Award points to reply author for receiving a like
        await this.pointsService.awardPoints(reply.user_id, 'receive_like', 'reply', replyId);
      }
      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
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

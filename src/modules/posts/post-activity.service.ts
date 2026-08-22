import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { REPLY_STATUS } from '@common/utils/constants';

/** Keeps the denormalized discussion-list activity timestamp correct. */
@Injectable()
export class PostActivityService {
  constructor(
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(Reply)
    private readonly replyRepository: Repository<Reply>,
  ) {}

  async markPostActive(postId: number, at: Date = new Date()): Promise<void> {
    await this.postRepository.update(postId, { last_activity_at: at });
  }

  /** Recompute after a visible reply disappears from the topic. */
  async recalculatePostActivity(postId: number): Promise<void> {
    const [post, latestReply] = await Promise.all([
      this.postRepository.findOne({
        where: { id: postId },
        select: { id: true, created_at: true },
      }),
      this.replyRepository.findOne({
        where: {
          post_id: postId,
          status: REPLY_STATUS.published,
          deleted_at: IsNull(),
        },
        order: { created_at: 'DESC' },
        select: { id: true, created_at: true },
      }),
    ]);

    if (!post) return;
    await this.markPostActive(postId, latestReply?.created_at ?? post.created_at);
  }
}

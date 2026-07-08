import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reply } from '../../entities/reply.entity';
import { Post } from '../../entities/post.entity';
import { User } from '../../entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { EventBusService } from '../plugins/event-bus.service';
import { CreateReplyDto } from './dto/create-reply.dto';
import { parseMarkdown } from '../../common/utils/markdown.util';
import { PointsService } from '../points/points.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class RepliesService {
  constructor(
    @InjectRepository(Reply)
    private replyRepository: Repository<Reply>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private notificationsService: NotificationsService,
    private adminNotificationsService: AdminNotificationsService,
    private eventBus: EventBusService,
    private pointsService: PointsService,
    private settingsService: SettingsService,
  ) {}

  async createReplyForPost(postId: number, dto: CreateReplyDto, userId: number): Promise<Reply> {
    const { content, parent_reply_id } = dto;

    // Execute "before" hook
    let modifiedDto = await this.eventBus.execute('reply.create', { ...dto, postId, userId });
    dto = modifiedDto;

    // Validate post exists and is published
    const post = await this.postRepository.findOne({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.status !== 'published') {
      throw new ForbiddenException('Cannot reply to unpublished post');
    }

    // If replying to a parent reply, validate it exists
    if (parent_reply_id) {
      const parentReply = await this.replyRepository.findOne({
        where: { id: parent_reply_id },
      });

      if (!parentReply) {
        throw new NotFoundException('Parent reply not found');
      }

      if (parentReply.post_id !== postId) {
        throw new ForbiddenException('Parent reply does not belong to this post');
      }
    }

    // Parse markdown to HTML
    const contentHtml = parseMarkdown(content);

    // Get current user for response
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const requiresApproval = await this.settingsService.getBoolean('require_reply_approval', true);

    // Create reply
    const newReply = this.replyRepository.create({
      post_id: postId,
      user_id: userId,
      parent_reply_id: parent_reply_id,
      content,
      content_html: contentHtml,
      status: requiresApproval ? 'pending' : 'published',
      like_count: 0,
    });

    const savedReply = await this.replyRepository.save(newReply);

    // Create notification for post author (if not the same user)
    if (savedReply.status === 'published' && post.user_id !== userId) {
      await this.notificationsService.create({
        user_id: post.user_id,
        type: 'reply',
        actor_id: userId,
        post_id: postId,
        reply_id: savedReply.id,
        content: content,
      });
    }

    if (savedReply.status === 'published') {
      await this.notificationsService.notifyMentionedUsers(
        content,
        postId,
        userId,
        savedReply.id,
      );

      // Award points for creating reply
      await this.awardPointsForReply(savedReply.id, userId);
    } else if (savedReply.status === 'pending') {
      this.adminNotificationsService.publishModerationPending({
        item_type: 'reply',
        item_id: savedReply.id,
        title: `帖子 #${postId} 的新回复`,
        content,
        author_username: user.username || `#${userId}`,
        action_url: '/admin/content/moderation?type=replies',
      }).catch((err) =>
        console.error('Admin reply moderation notification error:', err),
      );
    }

    // Execute "after" hook
    this.eventBus.execute('reply.created', { reply: savedReply, userId }).catch((err) =>
      console.error('reply.created hook error:', err),
    );

    return savedReply;
  }

  async awardPointsForReply(replyId: number, userId: number): Promise<void> {
    await this.pointsService.awardPoints(userId, 'create_reply', 'reply', replyId);
  }

  async getByPostId(postId: number, page: number = 1, limit: number = 20): Promise<{ data: Reply[]; total: number; page: number; totalPages: number }> {
    const skip = (page - 1) * limit;

    const [replies, total] = await this.replyRepository.findAndCount({
      where: {
        post_id: postId,
        status: 'published',
      },
      relations: ['user'],
      order: {
        created_at: 'ASC',
      },
      skip,
      take: limit,
    });

    return {
      data: replies,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number): Promise<Reply> {
    const reply = await this.replyRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    if (reply.status === 'deleted') {
      throw new NotFoundException('Reply has been deleted');
    }

    return reply;
  }

  async update(id: number, content: string, userId: number): Promise<Reply> {
    const reply = await this.replyRepository.findOne({
      where: { id },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    if (reply.user_id !== userId) {
      throw new ForbiddenException('You can only edit your own replies');
    }

    if (reply.status === 'deleted') {
      throw new ForbiddenException('Cannot update deleted reply');
    }

    // Parse markdown to HTML
    const contentHtml = parseMarkdown(content);

    // Update reply
    reply.content = content;
    reply.content_html = contentHtml;
    reply.updated_at = new Date();

    return await this.replyRepository.save(reply);
  }

  async softDelete(id: number, userId: number): Promise<void> {
    const reply = await this.replyRepository.findOne({
      where: { id },
    });

    if (!reply) {
      throw new NotFoundException('Reply not found');
    }

    if (reply.user_id !== userId) {
      throw new ForbiddenException('You can only delete your own replies');
    }

    // Soft delete
    reply.status = 'deleted';
    reply.deleted_at = new Date();

    await this.replyRepository.save(reply);
  }
}

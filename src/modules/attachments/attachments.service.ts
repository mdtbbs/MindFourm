import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attachment } from '@entities/attachment.entity';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { unlink } from 'fs/promises';
import * as path from 'path';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment)
    private attachmentRepository: Repository<Attachment>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(Reply)
    private replyRepository: Repository<Reply>,
  ) {}

  async create(data: {
    post_id?: number;
    reply_id?: number;
    user_id: number;
    file_name: string;
    file_path: string;
    file_size: number;
    mime_type: string;
  }): Promise<Attachment> {
    const attachment = this.attachmentRepository.create({
      ...data,
      download_count: 0,
    });
    return await this.attachmentRepository.save(attachment);
  }

  /**
   * Assert the caller may attach files to this post.
   *
   * `post_id` came straight from the request body with no validation, so a user
   * could graft files onto anyone else's post.
   */
  async assertCanAttachToPost(postId: number, userId: number, isStaff: boolean): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
      select: { id: true, user_id: true },
    });

    if (!post) {
      throw new NotFoundException('帖子不存在');
    }

    if (post.user_id !== userId && !isStaff) {
      throw new ForbiddenException('无权向该帖子添加附件');
    }
  }

  async assertCanAttachToReply(replyId: number, userId: number, isStaff: boolean): Promise<void> {
    const reply = await this.replyRepository.findOne({
      where: { id: replyId },
      select: { id: true, user_id: true },
    });
    if (!reply) throw new NotFoundException('回复不存在');
    if (reply.user_id !== userId && !isStaff) {
      throw new ForbiddenException('无权向该回复添加附件');
    }
  }

  /**
   * Fetch an attachment for download, refusing when its parent post is not
   * publicly visible.
   *
   * The download route is unauthenticated and previously performed no such check,
   * so attachments of draft, pending, rejected, soft-deleted and group-restricted
   * posts were all served to anyone holding an id.
   */
  async getForDownload(id: number): Promise<Attachment> {
    const attachment = await this.getById(id);
    await this.assertPublicAttachmentParent(attachment);
    return attachment;
  }

  async getByPostId(postId: number): Promise<Attachment[]> {
    await this.assertPublicPost(postId);
    return await this.attachmentRepository.find({
      where: { post_id: postId },
      order: { created_at: 'ASC' },
    });
  }

  async getByReplyId(replyId: number): Promise<Attachment[]> {
    await this.assertPublicReply(replyId);
    return await this.attachmentRepository.find({
      where: { reply_id: replyId },
      order: { created_at: 'ASC' },
    });
  }

  async updateRendererState(
    id: number,
    state: { status: string; resourceId?: string; errorCode?: string },
  ): Promise<void> {
    await this.attachmentRepository.update(id, {
      renderer_status: state.status,
      renderer_resource_id: state.resourceId || null,
      renderer_error_code: state.errorCode || null,
    });
  }

  async incrementDownloadCount(id: number): Promise<void> {
    await this.attachmentRepository.increment({ id }, 'download_count', 1);
  }

  async getById(id: number): Promise<Attachment> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    return attachment;
  }

  async delete(id: number, userId: number, isAdmin: boolean): Promise<void> {
    const attachment = await this.getById(id);

    // Check ownership or admin permission
    if (attachment.user_id !== userId && !isAdmin) {
      throw new ForbiddenException('You do not have permission to delete this attachment');
    }

    // Delete file from disk
    try {
      const filePath = path.resolve(attachment.file_path);
      await unlink(filePath);
    } catch (error) {
      console.error(`Failed to delete file from disk: ${attachment.file_path}`, error);
      // Continue with DB deletion even if file deletion fails
    }

    // Delete from database
    await this.attachmentRepository.remove(attachment);
  }

  private async assertPublicAttachmentParent(attachment: Attachment): Promise<void> {
    if (attachment.post_id) await this.assertPublicPost(attachment.post_id);
    if (attachment.reply_id) await this.assertPublicReply(attachment.reply_id);
  }

  private async assertPublicPost(postId: number): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
      select: { id: true, status: true, required_group_id: true, deleted_at: true } as any,
    });
    if (!post || post.status !== 'published' || post.required_group_id) {
      throw new NotFoundException('Attachment not found');
    }
  }

  private async assertPublicReply(replyId: number): Promise<void> {
    const reply = await this.replyRepository.findOne({
      where: { id: replyId },
      relations: ['post'],
      select: { id: true, status: true, deleted_at: true, post_id: true } as any,
    });
    if (!reply || reply.status !== 'published') throw new NotFoundException('Attachment not found');
    await this.assertPublicPost(reply.post_id);
  }
}

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Attachment } from '@entities/attachment.entity';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { mkdir, rename } from 'fs/promises';
import * as path from 'path';

function storageRoots() {
  const approvedRoot = path.resolve('./uploads/attachments');
  const quarantineRoot = path.resolve('./uploads/.quarantine/attachments');
  return { approvedRoot, quarantineRoot, pendingRoot: path.join(quarantineRoot, 'pending') };
}

function isWithin(target: string, root: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

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
      status: 'pending',
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
    if (attachment.status !== 'approved') throw new NotFoundException('Attachment not found');
    await this.assertPublicAttachmentParent(attachment);
    return attachment;
  }

  async getByPostId(postId: number): Promise<Attachment[]> {
    await this.assertPublicPost(postId);
    return await this.attachmentRepository.find({
      where: { post_id: postId, status: 'approved', deleted_at: IsNull() },
      order: { created_at: 'ASC' },
    });
  }

  async getByReplyId(replyId: number): Promise<Attachment[]> {
    await this.assertPublicReply(replyId);
    return await this.attachmentRepository.find({
      where: { reply_id: replyId, status: 'approved', deleted_at: IsNull() },
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
      where: { id, deleted_at: IsNull() },
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    return attachment;
  }

  async approve(id: number): Promise<Attachment> {
    const attachment = await this.getById(id);
    if (attachment.status === 'approved') return attachment;
    if (attachment.status !== 'pending') throw new NotFoundException('Attachment not found');

    const source = path.resolve(attachment.file_path);
    const { approvedRoot, pendingRoot } = storageRoots();
    if (!isWithin(source, pendingRoot)) throw new Error('attachment pending file is outside quarantine');
    await mkdir(approvedRoot, { recursive: true });
    const target = path.join(approvedRoot, path.basename(source));
    await rename(source, target);
    await this.attachmentRepository.update(id, { file_path: target, status: 'approved' });
    return { ...attachment, file_path: target, status: 'approved' };
  }

  async reject(id: number): Promise<void> {
    const attachment = await this.getById(id);
    if (attachment.status !== 'pending') throw new NotFoundException('Attachment not found');
    const source = path.resolve(attachment.file_path);
    if (!isWithin(source, storageRoots().quarantineRoot)) throw new Error('attachment pending file is outside quarantine');
    await this.attachmentRepository.update(id, { status: 'rejected', deleted_at: new Date() });
  }

  async delete(id: number, userId: number, isAdmin: boolean): Promise<void> {
    const attachment = await this.getById(id);

    // Check ownership or admin permission
    if (attachment.user_id !== userId && !isAdmin) {
      throw new ForbiddenException('You do not have permission to delete this attachment');
    }

    // Do not destroy user data synchronously.  A short retention window lets
    // staff recover accidental removals and prevents a failed unlink from
    // leaving an untracked file behind.
    let retiredPath = attachment.file_path;
    try {
      const filePath = path.resolve(attachment.file_path);
      const { approvedRoot, quarantineRoot } = storageRoots();
      if (isWithin(filePath, approvedRoot)) {
        await mkdir(quarantineRoot, { recursive: true });
        retiredPath = path.join(quarantineRoot, path.basename(filePath));
        await rename(filePath, retiredPath);
      } else if (!isWithin(filePath, quarantineRoot)) {
        throw new Error('attachment path is outside managed storage');
      }
    } catch (error) {
      console.error(`Failed to quarantine attachment: ${attachment.file_path}`, error);
      throw error;
    }
    await this.attachmentRepository.update(id, { file_path: retiredPath, deleted_at: new Date() });
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

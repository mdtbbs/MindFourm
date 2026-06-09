import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attachment } from '@entities/attachment.entity';
import { Post } from '@entities/post.entity';
import { unlink } from 'fs/promises';
import * as path from 'path';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment)
    private attachmentRepository: Repository<Attachment>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
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

  async getByPostId(postId: number): Promise<Attachment[]> {
    return await this.attachmentRepository.find({
      where: { post_id: postId },
      order: { created_at: 'ASC' },
    });
  }

  async getByReplyId(replyId: number): Promise<Attachment[]> {
    return await this.attachmentRepository.find({
      where: { reply_id: replyId },
      order: { created_at: 'ASC' },
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
}

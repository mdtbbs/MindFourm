import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceComment } from '@entities/resource-comment.entity';
import { CreateResourceCommentDto } from './dto/create-resource-comment.dto';
import { UpdateResourceCommentDto } from './dto/update-resource-comment.dto';

@Injectable()
export class ResourceCommentsService {
  constructor(
    @InjectRepository(ResourceComment)
    private commentRepo: Repository<ResourceComment>,
  ) {}

  async findByResource(resourceId: number, page = 1, limit = 20) {
    const [data, total] = await this.commentRepo.findAndCount({
      where: { resource_id: resourceId },
      order: { created_at: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(resourceId: number, userId: number, dto: CreateResourceCommentDto) {
    const comment = this.commentRepo.create({
      resource_id: resourceId,
      user_id: userId,
      parent_id: dto.parent_comment_id || null,
      content: dto.content,
    });
    return this.commentRepo.save(comment);
  }

  async update(id: number, userId: number, dto: UpdateResourceCommentDto) {
    const comment = await this.commentRepo.findOne({ where: { id } });
    if (!comment) throw new NotFoundException('评论不存在');
    if (comment.user_id !== userId) {
      throw new ForbiddenException('只能编辑自己的评论');
    }
    comment.content = dto.content;
    return this.commentRepo.save(comment);
  }

  async delete(id: number, userId: number, role: string) {
    const comment = await this.commentRepo.findOne({ where: { id } });
    if (!comment) throw new NotFoundException('评论不存在');
    if (comment.user_id !== userId && role !== 'admin' && role !== 'moderator') {
      throw new ForbiddenException('只能删除自己的评论');
    }
    await this.commentRepo.delete(id);
    return { success: true };
  }

  async incrementLike(id: number) {
    await this.commentRepo.increment({ id }, 'upvote_count', 1);
  }

  async decrementLike(id: number) {
    await this.commentRepo.decrement({ id }, 'upvote_count', 1);
  }
}

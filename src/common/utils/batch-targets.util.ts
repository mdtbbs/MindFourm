import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { applyPostVisibility } from './post-visibility.util';

export interface BatchViewer { id: number; role: string }
export type BatchTargetType = 'post' | 'reply';

export function validateBatchIds(ids: number[]): number[] {
  if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    throw new BadRequestException('最多查询 100 个正整数 ID');
  }
  return [...new Set(ids)];
}

export function parseBatchIds(value: unknown): number[] {
  if (typeof value !== 'string' || !value || !/^[1-9]\d*(,[1-9]\d*)*$/.test(value)) {
    throw new BadRequestException('无效的批量 ID');
  }
  return validateBatchIds(value.split(',').map(Number));
}

/** One bounded query for target visibility and card counters. No body columns. */
export async function visibleBatchTargets(
  postRepo: Repository<Post>, replyRepo: Repository<Reply>, type: BatchTargetType,
  ids: number[], viewer?: BatchViewer,
): Promise<Array<{ id: number; like_count: number }>> {
  ids = validateBatchIds(ids);
  if (!ids.length) return [];
  if (type === 'post') {
    const qb = postRepo.createQueryBuilder('post')
      .select(['post.id', 'post.like_count'])
      .where('post.id IN (:...batchIds)', { batchIds: ids });
    applyPostVisibility(qb, 'post', viewer);
    return qb.getMany();
  }
  const qb = replyRepo.createQueryBuilder('reply')
    .select(['reply.id', 'reply.like_count'])
    .innerJoin('reply.post', 'post')
    .where('reply.id IN (:...batchIds)', { batchIds: ids })
    .andWhere('reply.status = :replyPublished', { replyPublished: 'published' })
    .andWhere('post.deleted_at IS NULL')
    .andWhere(`(reply.parent_reply_id IS NULL OR EXISTS (
      SELECT 1 FROM replies parent WHERE parent.id = reply.parent_reply_id
        AND parent.post_id = reply.post_id AND parent.deleted_at IS NULL
        AND parent.status = :replyPublished
    ))`);
  applyPostVisibility(qb, 'post', viewer);
  return qb.getMany();
}

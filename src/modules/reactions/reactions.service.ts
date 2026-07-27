import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reaction, ReactionTargetType } from '@entities/reaction.entity';
import { Post } from '@entities/post.entity';
import { Reply } from '@entities/reply.entity';
import { isDuplicateKeyError } from '@common/utils/db-error.util';
import { emojiSortIndex, isAllowedEmoji } from './reaction-emojis';

export interface ReactionSummary {
  emoji: string;
  count: number;
  /** Whether the viewer this summary was built for has reacted with this emoji. */
  reacted: boolean;
}

/** Raw aggregate row; mysql2 returns COUNT/SUM as strings, hence the widened types. */
interface ReactionAggregateRow {
  target_id: number | string;
  emoji: string;
  count: number | string;
  reacted: number | string | null;
}

/**
 * Narrow a target type coming off the URL.
 *
 * `toggle` and the getters take `string` rather than the union so that route
 * parameters do not have to be cast at the call site — an unvalidated cast is how an
 * arbitrary `target_type` ends up in the table.
 */
function parseTargetType(value: string): ReactionTargetType {
  if (value !== 'post' && value !== 'reply') {
    throw new BadRequestException('无效的反应目标类型');
  }
  return value;
}

@Injectable()
export class ReactionsService {
  constructor(
    @InjectRepository(Reaction)
    private reactionRepo: Repository<Reaction>,
    @InjectRepository(Post)
    private postRepo: Repository<Post>,
    @InjectRepository(Reply)
    private replyRepo: Repository<Reply>,
  ) {}

  /**
   * Add the reaction if absent, remove it if present, and return the fresh aggregate.
   *
   * The aggregate is recomputed with SQL COUNT rather than adjusted in application
   * code, so concurrent reactions from other users cannot drift the number.
   */
  async toggle(
    userId: number,
    targetType: string,
    targetId: number,
    emoji: string,
  ): Promise<ReactionSummary[]> {
    const type = parseTargetType(targetType);
    if (!isAllowedEmoji(emoji)) {
      throw new BadRequestException('不支持的表情');
    }
    await this.assertTargetExists(type, targetId);

    const existing = await this.reactionRepo.findOne({
      where: { user_id: userId, target_type: type, target_id: targetId, emoji },
    });

    if (existing) {
      await this.reactionRepo.delete({ id: existing.id });
    } else {
      try {
        await this.reactionRepo.save(
          this.reactionRepo.create({
            user_id: userId,
            target_type: type,
            target_id: targetId,
            emoji,
          }),
        );
      } catch (error) {
        // A concurrent double-tap loses the race against the unique constraint. The
        // reaction exists either way, so the aggregate below is still the right
        // answer — surfacing a 500 here would only be noise.
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    return this.getForTarget(type, targetId, userId);
  }

  async getForTarget(
    targetType: string,
    targetId: number,
    viewerId?: number,
  ): Promise<ReactionSummary[]> {
    const grouped = await this.getForTargets(targetType, [targetId], viewerId);
    return grouped[targetId] ?? [];
  }

  /**
   * Aggregates for many targets in one query, keyed by target id.
   *
   * The batch form exists for list pages: calling {@link getForTarget} per row turns
   * a 20-post page into 20 round trips. Every requested id gets an entry so callers
   * do not have to distinguish "no reactions" from "not queried".
   */
  async getForTargets(
    targetType: string,
    targetIds: number[],
    viewerId?: number,
  ): Promise<Record<number, ReactionSummary[]>> {
    const type = parseTargetType(targetType);
    const uniqueIds = [...new Set(targetIds)].filter((id) => Number.isInteger(id));

    const result: Record<number, ReactionSummary[]> = {};
    for (const id of uniqueIds) {
      result[id] = [];
    }
    if (uniqueIds.length === 0) {
      return result;
    }

    const rows = await this.reactionRepo
      .createQueryBuilder('r')
      .select('r.target_id', 'target_id')
      .addSelect('r.emoji', 'emoji')
      .addSelect('COUNT(*)', 'count')
      // Folding the viewer's own state into the same aggregate keeps this to one
      // round trip; a follow-up "did I react?" query per emoji is the N+1 this
      // replaces. Ids are positive, so 0 stands in for an anonymous viewer and
      // matches nothing.
      .addSelect('SUM(CASE WHEN r.user_id = :viewerId THEN 1 ELSE 0 END)', 'reacted')
      .where('r.target_type = :targetType', { targetType: type })
      .andWhere('r.target_id IN (:...targetIds)', { targetIds: uniqueIds })
      .setParameter('viewerId', viewerId ?? 0)
      .groupBy('r.target_id')
      .addGroupBy('r.emoji')
      .getRawMany<ReactionAggregateRow>();

    for (const row of rows) {
      const targetId = Number(row.target_id);
      const summaries = result[targetId];
      if (!summaries) {
        continue;
      }
      summaries.push({
        emoji: row.emoji,
        count: Number(row.count),
        reacted: Number(row.reacted ?? 0) > 0,
      });
    }

    // Canonical order, so the row does not reshuffle between renders as counts change.
    for (const summaries of Object.values(result)) {
      summaries.sort((a, b) => emojiSortIndex(a.emoji) - emojiSortIndex(b.emoji));
    }

    return result;
  }

  /**
   * Soft-deleted targets are excluded: TypeORM's default `findOne` scope skips rows
   * with a `deleted_at`, so a removed post stops accepting reactions.
   */
  private async assertTargetExists(
    targetType: ReactionTargetType,
    targetId: number,
  ): Promise<void> {
    const found = targetType === 'post'
      ? await this.postRepo.findOne({ where: { id: targetId }, select: ['id'] })
      : await this.replyRepo.findOne({ where: { id: targetId }, select: ['id'] });

    if (!found) {
      throw new NotFoundException(targetType === 'post' ? '帖子不存在' : '回复不存在');
    }
  }
}

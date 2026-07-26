import {
  Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserBlock } from '@entities/user-block.entity';
import { User } from '@entities/user.entity';
import { ROLES, RoleName } from '@common/utils/constants';
import { isDuplicateKeyError } from '@common/utils/db-error.util';
import { toPublicUser } from '../users/public-user.util';

interface BlockedIdsCacheEntry {
  ids: number[];
  expiry: number;
}

export interface BlockedUserItem {
  id: number;
  reason: string | null;
  created_at: Date;
  user: Partial<User>;
}

export interface BlockedUserPage {
  data: BlockedUserItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/** Staff cannot be blocked; roles are hierarchical levels, so compare numerically. */
function isStaffRole(role: string): boolean {
  return (ROLES[role as RoleName] ?? 0) >= ROLES.moderator;
}

@Injectable()
export class UserBlocksService {
  private readonly logger = new Logger(UserBlocksService.name);
  private readonly blockedIdsCache = new Map<number, BlockedIdsCacheEntry>();
  private readonly refreshInFlight = new Map<number, Promise<number[]>>();
  private readonly CACHE_TTL = 10000; // 10 seconds in milliseconds
  private readonly MAX_CACHED_BLOCKERS = 1000;

  constructor(
    @InjectRepository(UserBlock)
    private blockRepo: Repository<UserBlock>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  /**
   * Block a user, or return the existing block unchanged.
   *
   * Idempotent rather than an error: the button is fire-and-forget from the client's
   * point of view, and a retry that 400s reads to the user as "blocking failed".
   */
  async block(blockerId: number, blockedId: number, reason?: string): Promise<UserBlock> {
    if (blockerId === blockedId) {
      throw new BadRequestException('不能拉黑自己');
    }

    const target = await this.userRepo.findOne({
      where: { id: blockedId },
      select: ['id', 'role'],
    });
    if (!target) {
      throw new NotFoundException('用户不存在');
    }

    // Otherwise a user could opt out of moderation: blocking the staff who warn them
    // would suppress those messages and hide their own content from that account.
    if (isStaffRole(target.role)) {
      throw new ForbiddenException('不能拉黑管理员或版主');
    }

    const existing = await this.findBlock(blockerId, blockedId);
    if (existing) {
      return existing;
    }

    const block = this.blockRepo.create({
      blocker_id: blockerId,
      blocked_id: blockedId,
      reason: reason ?? null,
    });

    try {
      const saved = await this.blockRepo.save(block);
      this.invalidate(blockerId);
      return saved;
    } catch (error) {
      // The check above is a read-then-write race, so a concurrent double submit
      // lands here. The unique constraint is the real guard; the loser of the race
      // gets the same answer as the winner.
      if (isDuplicateKeyError(error)) {
        const winner = await this.findBlock(blockerId, blockedId);
        if (winner) {
          this.invalidate(blockerId);
          return winner;
        }
      }
      throw error;
    }
  }

  async unblock(blockerId: number, blockedId: number): Promise<void> {
    const result = await this.blockRepo.delete({
      blocker_id: blockerId,
      blocked_id: blockedId,
    });
    this.invalidate(blockerId);
    if (result.affected === 0) {
      throw new NotFoundException('未拉黑该用户');
    }
  }

  async list(
    blockerId: number,
    page: number = 1,
    limit: number = DEFAULT_PAGE_SIZE,
  ): Promise<BlockedUserPage> {
    const currentPage = Math.max(1, Math.floor(page) || 1);
    const cappedLimit = Math.min(
      Math.max(1, Math.floor(limit) || DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );

    const [blocks, total] = await this.blockRepo.findAndCount({
      where: { blocker_id: blockerId },
      relations: ['blocked'],
      order: { created_at: 'DESC' },
      skip: (currentPage - 1) * cappedLimit,
      take: cappedLimit,
    });

    return {
      data: blocks.map((block) => ({
        id: block.id,
        reason: block.reason,
        created_at: block.created_at,
        // The relation loads the whole row, including the email and point balances.
        user: toPublicUser(block.blocked),
      })),
      pagination: {
        page: currentPage,
        limit: cappedLimit,
        total,
        // All four fields are required: the web client's normalizer treats a page
        // with any of them missing as "no data".
        totalPages: Math.max(1, Math.ceil(total / cappedLimit)),
      },
    };
  }

  async isBlocked(blockerId: number, blockedId: number): Promise<boolean> {
    const blockedIds = await this.getBlockedIds(blockerId);
    return blockedIds.includes(blockedId);
  }

  /**
   * Ids this user has blocked, for other modules to filter content with.
   *
   * Cached per blocker for {@link CACHE_TTL}: called on every list render, so an
   * uncached version would add a query per page view. Writes invalidate the entry,
   * so the window only matters for a block made by another process.
   */
  async getBlockedIds(blockerId: number): Promise<number[]> {
    const cached = this.blockedIdsCache.get(blockerId);
    if (cached && Date.now() <= cached.expiry) {
      return cached.ids;
    }

    // Awaited, with concurrent callers sharing one query. A synchronous wrapper that
    // kicked off a fire-and-forget refresh — the shape this replaces in BansService —
    // returns the pre-warm empty list to every caller, so the filter silently passes
    // blocked content straight through.
    let inFlight = this.refreshInFlight.get(blockerId);
    if (!inFlight) {
      inFlight = this.loadBlockedIds(blockerId).finally(() => {
        this.refreshInFlight.delete(blockerId);
      });
      this.refreshInFlight.set(blockerId, inFlight);
    }

    return inFlight;
  }

  /**
   * Throw if `recipientId` has blocked `senderId`.
   *
   * Enforced server-side because the block is invisible to the sender: hiding the
   * compose box in the client would still leave the API reachable.
   */
  async assertNotBlocked(senderId: number, recipientId: number): Promise<void> {
    if (await this.isBlocked(recipientId, senderId)) {
      throw new ForbiddenException('对方已将你拉黑，无法发送消息');
    }
  }

  private findBlock(blockerId: number, blockedId: number): Promise<UserBlock | null> {
    return this.blockRepo.findOne({
      where: { blocker_id: blockerId, blocked_id: blockedId },
    });
  }

  private async loadBlockedIds(blockerId: number): Promise<number[]> {
    try {
      const rows = await this.blockRepo.find({
        where: { blocker_id: blockerId },
        select: ['blocked_id'],
      });
      const ids = rows.map((row) => row.blocked_id);
      this.setCache(blockerId, ids);
      return ids;
    } catch (error) {
      this.logger.error(
        `Failed to load blocked ids for user ${blockerId}: ${(error as Error).message}`,
      );
      // Serve the previous snapshot instead of reading a transient database error as
      // "nothing is blocked". With nothing cached there is no safe answer, so the
      // failure surfaces rather than quietly failing open.
      const stale = this.blockedIdsCache.get(blockerId);
      if (!stale) {
        throw error;
      }
      return stale.ids;
    }
  }

  private setCache(blockerId: number, ids: number[]): void {
    // Bounded, because one entry per blocker grows with the user table. Map iterates
    // in insertion order, so re-inserting keeps the evicted key the oldest write.
    this.blockedIdsCache.delete(blockerId);
    if (this.blockedIdsCache.size >= this.MAX_CACHED_BLOCKERS) {
      const oldest = this.blockedIdsCache.keys().next().value;
      if (oldest !== undefined) {
        this.blockedIdsCache.delete(oldest);
      }
    }
    this.blockedIdsCache.set(blockerId, { ids, expiry: Date.now() + this.CACHE_TTL });
  }

  private invalidate(blockerId: number): void {
    this.blockedIdsCache.delete(blockerId);
  }
}

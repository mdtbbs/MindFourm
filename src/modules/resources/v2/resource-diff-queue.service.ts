import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { RedisService } from '../../../database/redis.service';
import { ResourceVisualDiffService } from './resource-visual-diff.service';

const QUEUE_KEY = 'forum:resource-diff:jobs';
const DEDUPE_PREFIX = 'forum:resource-diff:queued';

type DiffJob = { resource_id: number; from_version_id: number; to_version_id: number };

/**
 * 蓝图/地图版本发布后的异步 Diff 预计算队列。
 *
 * 队列放在 Redis 列表；Redis 不可用时 `RedisService` 退化为进程内列表，
 * 队列语义仍然成立（只是不跨进程）。真正的计算幂等且带分布式锁，重复
 * 投递不会重复写坏数据。测试环境不启动定时器。
 */
@Injectable()
export class ResourceDiffQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceDiffQueueService.name);
  private timer?: NodeJS.Timeout;
  private draining = false;

  constructor(
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly visualDiff?: ResourceVisualDiffService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test' || !this.redis || !this.visualDiff) return;
    this.timer = setInterval(() => void this.drainOnce(), 1500);
    this.timer.unref?.();
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async enqueue(resourceId: number, fromVersionId: number, toVersionId: number): Promise<boolean> {
    if (!this.redis || !fromVersionId || !toVersionId || fromVersionId === toVersionId) return false;
    const dedupeKey = `${DEDUPE_PREFIX}:${fromVersionId}:${toVersionId}`;
    if (!await this.redis.setIfNotExists(dedupeKey, '1', 300)) return false;
    try {
      await this.redis.rpush(QUEUE_KEY, JSON.stringify({ resource_id: resourceId, from_version_id: fromVersionId, to_version_id: toVersionId } satisfies DiffJob));
      return true;
    } catch {
      await this.redis.del(dedupeKey).catch(() => undefined);
      return false;
    }
  }

  /** 处理最多 `limit` 个任务；供定时器和测试调用。 */
  async drainOnce(limit = 5): Promise<number> {
    if (this.draining || !this.redis || !this.visualDiff) return 0;
    this.draining = true;
    let processed = 0;
    try {
      for (let index = 0; index < limit; index += 1) {
        const raw = await this.redis.lpop(QUEUE_KEY);
        if (!raw) break;
        let job: DiffJob | null = null;
        try { job = JSON.parse(raw) as DiffJob; } catch { job = null; }
        if (!job || !Number.isSafeInteger(Number(job.resource_id)) || !Number.isSafeInteger(Number(job.from_version_id)) || !Number.isSafeInteger(Number(job.to_version_id))) continue;
        try {
          await this.visualDiff.computeAndStore(Number(job.resource_id), Number(job.from_version_id), Number(job.to_version_id));
          processed += 1;
        } catch (error) {
          this.logger.warn(`Resource diff precompute failed for ${job.from_version_id}->${job.to_version_id}: ${(error as Error).message}`);
        } finally {
          await this.redis.del(`${DEDUPE_PREFIX}:${job.from_version_id}:${job.to_version_id}`).catch(() => undefined);
        }
      }
    } finally {
      this.draining = false;
    }
    return processed;
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { DownloadEvent } from '@entities/download-event.entity';
import { incrementResourceCounter } from '../resources/resource-counter.util';

export type GrantRecord = {
  resourceId: number;
  versionId: number | null;
  fileId: number | null;
  grantedAt: Date;
  userId: number | null;
  clientType: string | null;
  clientVersion?: string | null;
  platform?: string | null;
  backend?: string | null;
};

@Injectable()
export class DownloadGrantService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DownloadGrantService.name);
  private static readonly DEDUP_WINDOW_MS = 60 * 1000;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private readonly dataSource: DataSource) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.cleanupTimer = setInterval(() => void this.cleanupDedupState(), 6 * 60 * 60 * 1000);
    this.cleanupTimer.unref();
    void this.cleanupDedupState();
  }

  onModuleDestroy(): void { if (this.cleanupTimer) clearInterval(this.cleanupTimer); }

  private async cleanupDedupState(): Promise<void> {
    try {
      const result = await this.dataSource.query('DELETE FROM download_grant_dedup WHERE last_granted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
      const removed = Number(result?.affectedRows ?? result?.[0]?.affectedRows ?? 0);
      if (removed) this.logger.log(`Removed ${removed} expired download dedup key(s)`);
    } catch (error) {
      this.logger.warn(`Download dedup cleanup failed: ${(error as Error).message}`);
    }
  }

  /**
   * Persists request/grant facts and increments the aggregate in one transaction.
   * A locked DB dedup row arbitrates concurrent instances and remains effective
   * across application restarts. The pseudonymous key is retained for one day.
   */
  async recordGrant(record: GrantRecord, actorKey: string): Promise<boolean> {
    const dedupKey = createHash('sha256')
      .update(`${record.fileId ?? `resource:${record.resourceId}`}:${actorKey}`)
      .digest('hex');
    const dedupBucket = String(Math.floor(record.grantedAt.getTime() / DownloadGrantService.DEDUP_WINDOW_MS));

    const queryRunner = this.dataSource.createQueryRunner();
    let transactionStarted = false;
    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      transactionStarted = true;

      // The durable lock row serializes grants for this (file, actor) across
      // workers. Unlike minute buckets alone, this enforces a true rolling 60s.
      await queryRunner.query(
        `INSERT IGNORE INTO download_grant_dedup (dedup_key, last_granted_at) VALUES (?, '1970-01-01 00:00:00')`,
        [dedupKey],
      );
      const dedupRows = await queryRunner.query(
        'SELECT last_granted_at, last_granted_at > DATE_SUB(?, INTERVAL 60 SECOND) AS is_recent FROM download_grant_dedup WHERE dedup_key = ? FOR UPDATE',
        [record.grantedAt, dedupKey],
      );

      await queryRunner.manager.insert(DownloadEvent, {
        event_type: 'requested', resource_id: record.resourceId, version_id: record.versionId,
        file_id: record.fileId, user_id: record.userId, client_type: record.clientType,
        client_version: record.clientVersion || null, platform: record.platform || null,
        backend: record.backend || null, dedup_key: null, dedup_bucket: null,
        created_at: record.grantedAt,
      });

      if (Number(dedupRows?.[0]?.is_recent) === 1) {
        await queryRunner.commitTransaction();
        transactionStarted = false;
        return false;
      }

      await queryRunner.query('UPDATE download_grant_dedup SET last_granted_at = ? WHERE dedup_key = ?', [record.grantedAt, dedupKey]);
      await queryRunner.manager.insert(DownloadEvent, {
        event_type: 'granted', resource_id: record.resourceId, version_id: record.versionId,
        file_id: record.fileId, user_id: record.userId, client_type: record.clientType,
        client_version: record.clientVersion || null, platform: record.platform || null,
        backend: record.backend || null, dedup_key: dedupKey, dedup_bucket: dedupBucket,
        created_at: record.grantedAt,
      });
      // Counting a download must not move resources.updated_at; see the helper.
      const affected = await incrementResourceCounter(queryRunner.manager, record.resourceId, 'download_count');
      if (affected === 0) throw new Error('resource missing while recording download grant');
      await queryRunner.commitTransaction();
      transactionStarted = false;
      this.logger.verbose(`Download granted: file=${record.fileId ?? 'legacy'} resource=${record.resourceId}`);
      return true;
    } catch (error) {
      if (transactionStarted) await queryRunner.rollbackTransaction().catch(() => undefined);
      throw error;
    } finally {
      await queryRunner.release().catch(() => undefined);
    }

  }

  computeDisplayedCount(legacyBaseline: number, v1Aggregate: number): number {
    return legacyBaseline + v1Aggregate;
  }
}

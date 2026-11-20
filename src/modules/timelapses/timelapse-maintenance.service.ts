import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { TimelapseReport } from '../../entities/timelapse-report.entity';
import { TimelapseStorageService } from './timelapse-storage.service';
import { TimelapseRefsService } from './timelapse-refs.service';
import { TimelapsesService } from './timelapses.service';
import {
  TIMELAPSE_PROCESSING_TIMEOUT_MINUTES, TIMELAPSE_UPLOAD_TIMEOUT_HOURS,
} from './timelapse.constants';

export type TimelapseMaintenanceResult = {
  sources_purged: number;
  drafts_expired: number;
  uploads_expired: number;
  processing_failed: number;
  refs_removed: number;
  refs_repaired: number;
};

/**
 * 延时战报生命周期维护。
 *
 * 与设计 D15 对齐：
 * - 原始 `.mreplay.zip` 在合成完成 24 小时后物理删除；
 * - 未绑定帖子的草稿 30 天后软删除并清理对象；
 * - 超过 30 分钟没有回写的 processing 任务标记失败；
 * - 对账 `timelapse_post_refs`，兜住异常中断绕过的写入路径。
 */
@Injectable()
export class TimelapseMaintenanceService {
  private readonly logger = new Logger(TimelapseMaintenanceService.name);
  private running = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: TimelapseStorageService,
    private readonly refs: TimelapseRefsService,
    private readonly timelapses: TimelapsesService,
  ) {}

  @Interval(15 * 60 * 1000)
  async sweep(): Promise<void> {
    if (this.running || !this.storage.isConfigured()) return;
    this.running = true;
    try {
      const result = await this.runMaintenance();
      if (Object.values(result).some((value) => value > 0)) {
        this.logger.log(`延时战报维护完成: ${JSON.stringify(result)}`);
      }
    } catch (error: any) {
      this.logger.warn(`延时战报维护失败，下一轮将重试: ${error?.message || error}`);
    } finally {
      this.running = false;
    }
  }

  async runMaintenance(): Promise<TimelapseMaintenanceResult> {
    const result: TimelapseMaintenanceResult = {
      sources_purged: 0,
      drafts_expired: 0,
      uploads_expired: 0,
      processing_failed: 0,
      refs_removed: 0,
      refs_repaired: 0,
    };
    result.sources_purged = await this.purgeSources();
    result.drafts_expired = await this.expireDrafts();
    result.uploads_expired = await this.expireStaleUploads();
    result.processing_failed = await this.failStaleProcessing();
    const reconciled = await this.dataSource.transaction(async (manager) => this.refs.reconcile(manager));
    result.refs_removed = reconciled.removed;
    result.refs_repaired = reconciled.repaired;
    return result;
  }

  private async purgeSources(): Promise<number> {
    const rows: Array<Pick<TimelapseReport, 'id' | 'source_object_key'>> = await this.dataSource.query(
      `SELECT id, source_object_key FROM timelapse_reports
       WHERE source_purge_after IS NOT NULL AND source_purge_after <= NOW() AND source_object_key IS NOT NULL
       LIMIT 500`,
    );
    let purged = 0;
    for (const row of rows) {
      const update = await this.dataSource.query(
        'UPDATE timelapse_reports SET source_object_key = NULL, source_purge_after = NULL, updated_at = NOW() WHERE id = ? AND source_object_key = ?',
        [row.id, row.source_object_key],
      );
      if (!update?.affectedRows) continue;
      if (row.source_object_key) await this.storage.deleteObject(row.source_object_key).catch(() => undefined);
      purged += 1;
    }
    return purged;
  }

  private async expireDrafts(): Promise<number> {
    const rows: Array<Pick<TimelapseReport, 'id' | 'source_object_key' | 'video_object_key' | 'poster_object_key'>> = await this.dataSource.query(
      `SELECT id, source_object_key, video_object_key, poster_object_key FROM timelapse_reports
       WHERE expires_at IS NOT NULL AND expires_at <= NOW() AND bound_post_count = 0 AND deleted_at IS NULL
       LIMIT 200`,
    );
    let expired = 0;
    for (const row of rows) {
      // 先更新并检查 affectedRows：如果期间有帖子绑定了该战报，更新会失败，
      // 此时绝不能删除对象，否则会把刚转为永久保留的成片删掉。
      const update = await this.dataSource.query(
        `UPDATE timelapse_reports
         SET deleted_at = NOW(), source_object_key = NULL, video_object_key = NULL, poster_object_key = NULL,
             source_purge_after = NULL, updated_at = NOW()
         WHERE id = ? AND bound_post_count = 0 AND deleted_at IS NULL`,
        [row.id],
      );
      if (!update?.affectedRows) continue;
      await Promise.all([row.source_object_key, row.video_object_key, row.poster_object_key]
        .filter((key): key is string => Boolean(key))
        .map((key) => this.storage.deleteObject(key).catch(() => undefined)));
      expired += 1;
    }
    return expired;
  }

  private async expireStaleUploads(): Promise<number> {
    const rows: Array<Pick<TimelapseReport, 'id' | 'source_object_key'>> = await this.dataSource.query(
      `SELECT id, source_object_key FROM timelapse_reports
       WHERE status = 'uploading' AND deleted_at IS NULL
         AND created_at <= DATE_SUB(NOW(), INTERVAL ${TIMELAPSE_UPLOAD_TIMEOUT_HOURS} HOUR)
       LIMIT 200`,
    );
    let expired = 0;
    for (const row of rows) {
      const update = await this.dataSource.query(
        `UPDATE timelapse_reports SET deleted_at = NOW(), source_object_key = NULL, updated_at = NOW()
         WHERE id = ? AND status = 'uploading' AND deleted_at IS NULL`,
        [row.id],
      );
      if (!update?.affectedRows) continue;
      if (row.source_object_key) await this.storage.deleteObject(row.source_object_key).catch(() => undefined);
      expired += 1;
    }
    // 队列丢失的 queued 任务不会自己失败；超过上传宽限期后统一标记 failed。
    const queued: Array<Pick<TimelapseReport, 'id'>> = await this.dataSource.query(
      `SELECT id FROM timelapse_reports
       WHERE status = 'queued' AND deleted_at IS NULL AND created_at <= DATE_SUB(NOW(), INTERVAL ${TIMELAPSE_UPLOAD_TIMEOUT_HOURS} HOUR)
       LIMIT 200`,
    );
    for (const row of queued) {
      await this.dataSource.query(
        `UPDATE timelapse_reports SET status = 'failed', failure_code = 'WORKER_QUEUE_LOST', failure_reason = '渲染队列任务丢失',
             source_purge_after = DATE_ADD(NOW(), INTERVAL 24 HOUR), updated_at = NOW()
         WHERE id = ? AND status = 'queued'`,
        [row.id],
      );
      expired += 1;
    }
    return expired;
  }

  private async failStaleProcessing(): Promise<number> {
    const rows: TimelapseReport[] = await this.dataSource.query(
      `SELECT * FROM timelapse_reports
       WHERE status = 'processing' AND deleted_at IS NULL
         AND updated_at <= DATE_SUB(NOW(), INTERVAL ${TIMELAPSE_PROCESSING_TIMEOUT_MINUTES} MINUTE)
       LIMIT 100`,
    );
    let failed = 0;
    for (const row of rows) {
      await this.timelapses.applyFailure(row, 'WORKER_TIMEOUT', '渲染 Worker 超时未回写结果');
      failed += 1;
    }
    return failed;
  }
}

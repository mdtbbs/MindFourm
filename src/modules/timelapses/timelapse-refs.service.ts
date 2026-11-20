import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { TimelapseReport } from '../../entities/timelapse-report.entity';
import { ApiV1Exception } from '../../common/exceptions/api-v1.exception';
import {
  applyBattleReportMetadata, collectBattleReportPublicIds,
} from '../../common/utils/tiptap-content.util';
import { TIMELAPSE_DRAFT_TTL_DAYS } from './timelapse.constants';

type ReportLookup = Pick<TimelapseReport, 'id' | 'public_id' | 'author_user_id' | 'status' | 'visibility' | 'map_name' | 'max_wave'>;

/**
 * 帖子正文与战报之间的引用同步。
 *
 * 设计要点：
 * - 只有“已发布帖子”的引用进入 `timelapse_post_refs`；草稿/待审/已删除帖子不占用
 *   战报的永久保留额度。
 * - `bound_post_count` 与 `expires_at` 在同一事务内由引用表重算，避免并发编辑时
 *   出现计数与宽限期不一致。
 * - 读取时以引用表为准，因此帖子状态变化（发布/下架/删除）只需要重算一次。
 */
@Injectable()
export class TimelapseRefsService {
  private readonly logger = new Logger(TimelapseRefsService.name);

  constructor(
    @InjectRepository(TimelapseReport) private readonly reports: Repository<TimelapseReport>,
  ) {}

  /**
   * 回填战报的地图名/最高波次，并校验作者可见性。
   *
   * `strict` 用于新建帖子：引用不存在或他人未审核战报直接拒绝。
   * 编辑旧帖子时使用非严格模式：已被删除的战报保持占位，不阻塞保存。
   */
  async resolveDocument(
    document: Record<string, unknown>,
    actorUserId: number,
    options: { strict?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const publicIds = collectBattleReportPublicIds(document);
    if (!publicIds.length) return document;

    const reports = await this.reports.find({
      where: { public_id: In(publicIds), deleted_at: IsNull() },
      select: { id: true, public_id: true, author_user_id: true, status: true, visibility: true, map_name: true, max_wave: true },
    });
    const byPublicId = new Map(reports.map((report) => [report.public_id, report as ReportLookup]));
    const metadata = new Map<string, { mapName: string; maxWave: number }>();

    for (const publicId of publicIds) {
      const report = byPublicId.get(publicId);
      if (!report) {
        if (options.strict) {
          throw new ApiV1Exception('TIMELAPSE_NOT_FOUND', HttpStatus.BAD_REQUEST, '引用的基地延时战报不存在或已被删除。', false, [{ publicId }]);
        }
        continue;
      }
      const isOwner = report.author_user_id === actorUserId;
      const visible = isOwner || (report.status === 'published' && report.visibility !== 'private');
      if (!visible && options.strict) {
        throw new ApiV1Exception('TIMELAPSE_NOT_AVAILABLE', HttpStatus.FORBIDDEN, '引用的基地延时战报尚未通过审核或不可见。', false, [{ publicId }]);
      }
      if (visible) metadata.set(publicId, { mapName: report.map_name || '', maxWave: report.max_wave || 0 });
    }
    // 即使是编辑旧帖子，也要覆盖客户端携带的 mapName/maxWave，防止伪造摘要。
    return applyBattleReportMetadata(document, metadata);
  }

  /**
   * 帖子写入事务内同步引用。
   *
   * `document` 是本次写入后的正文（未提供正文时传当前库内正文）。
   * `status` 是本次写入后的帖子状态；非 `published` 会清空该帖子的全部引用。
   */
  async syncPostRefs(
    manager: EntityManager,
    postId: number,
    document: unknown,
    status: string | null | undefined,
  ): Promise<{ added: number; removed: number }> {
    const desiredPublicIds = status === 'published' && document
      ? collectBattleReportPublicIds(document)
      : [];
    const desiredIds = await this.resolveInternalIds(manager, desiredPublicIds);
    const existingRows: Array<{ timelapse_id: string }> = await manager.query(
      'SELECT timelapse_id FROM timelapse_post_refs WHERE post_id = ?',
      [postId],
    );
    const existing = new Set(existingRows.map((row) => String(row.timelapse_id)));
    const desired = new Set(desiredIds.map((id) => String(id)));

    const toRemove = [...existing].filter((id) => !desired.has(id));
    const toAdd = [...desired].filter((id) => !existing.has(id));
    const affected = new Set<string>([...toRemove, ...toAdd]);

    if (toRemove.length) {
      await manager.query(
        `DELETE FROM timelapse_post_refs WHERE post_id = ? AND timelapse_id IN (${toRemove.map(() => '?').join(', ')})`,
        [postId, ...toRemove],
      );
    }
    for (const timelapseId of toAdd) {
      await manager.query(
        'INSERT IGNORE INTO timelapse_post_refs (timelapse_id, post_id, created_at) VALUES (?, ?, NOW())',
        [timelapseId, postId],
      );
    }
    await this.recountBoundPosts(manager, [...affected]);
    return { added: toAdd.length, removed: toRemove.length };
  }

  /** 帖子删除/下架时移除它的全部引用。 */
  async removePostRefs(manager: EntityManager, postId: number): Promise<number> {
    const rows: Array<{ timelapse_id: string }> = await manager.query(
      'SELECT timelapse_id FROM timelapse_post_refs WHERE post_id = ?',
      [postId],
    );
    if (!rows.length) return 0;
    const ids = rows.map((row) => String(row.timelapse_id));
    await manager.query('DELETE FROM timelapse_post_refs WHERE post_id = ?', [postId]);
    await this.recountBoundPosts(manager, ids);
    return ids.length;
  }

  /**
   * 维护任务对账：清理指向非发布/已删除帖子的引用，并修复计数与宽限期。
   *
   * 用来兜住历史数据、后台批量操作或异常中断绕过的写入路径。
   */
  async reconcile(manager: EntityManager): Promise<{ removed: number; repaired: number }> {
    const stale: Array<{ timelapse_id: string }> = await manager.query(
      `SELECT DISTINCT r.timelapse_id FROM timelapse_post_refs r
       LEFT JOIN posts p ON p.id = r.post_id
       WHERE p.id IS NULL OR p.status <> 'published' OR p.deleted_at IS NOT NULL`,
    );
    const staleIds = stale.map((row) => String(row.timelapse_id));
    const removedResult = await manager.query(
      `DELETE r FROM timelapse_post_refs r
       LEFT JOIN posts p ON p.id = r.post_id
       WHERE p.id IS NULL OR p.status <> 'published' OR p.deleted_at IS NOT NULL`,
    );
    const affectedRows: Array<{ id: string }> = await manager.query(
      `SELECT t.id FROM timelapse_reports t
       WHERE t.bound_post_count <> (SELECT COUNT(*) FROM timelapse_post_refs r WHERE r.timelapse_id = t.id)
          OR (t.bound_post_count = 0 AND t.expires_at IS NULL AND t.deleted_at IS NULL)
          OR (t.bound_post_count > 0 AND t.expires_at IS NOT NULL)`,
    );
    const affected = [...new Set([...staleIds, ...affectedRows.map((row) => String(row.id))])];
    await this.recountBoundPosts(manager, affected);
    return {
      removed: Number(removedResult?.affectedRows ?? staleIds.length),
      repaired: affected.length,
    };
  }

  private async resolveInternalIds(manager: EntityManager, publicIds: string[]): Promise<string[]> {
    const unique = [...new Set(publicIds)];
    if (!unique.length) return [];
    const rows: Array<{ id: string }> = await manager.query(
      `SELECT id FROM timelapse_reports WHERE public_id IN (${unique.map(() => '?').join(', ')}) AND deleted_at IS NULL`,
      unique,
    );
    return rows.map((row) => String(row.id));
  }

  private async recountBoundPosts(manager: EntityManager, timelapseIds: string[]): Promise<void> {
    for (const timelapseId of [...new Set(timelapseIds)]) {
      const rows: Array<{ count: number | string }> = await manager.query(
        'SELECT COUNT(*) AS count FROM timelapse_post_refs WHERE timelapse_id = ?',
        [timelapseId],
      );
      const count = Number(rows?.[0]?.count || 0);
      await manager.query(
        `UPDATE timelapse_reports
         SET bound_post_count = ?,
             expires_at = CASE WHEN ? > 0 THEN NULL ELSE DATE_ADD(NOW(), INTERVAL ${TIMELAPSE_DRAFT_TTL_DAYS} DAY) END
         WHERE id = ?`,
        [count, count, timelapseId],
      );
    }
  }
}

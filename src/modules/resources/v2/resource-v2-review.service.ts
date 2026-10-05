import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import * as path from 'path';
import { ResourceStorageService, type PreparedResourcePromotion } from '../resource-storage.service';
import { NotificationsService } from '../../notifications/notifications.service';

type SqlExecutor = { query(sql: string, parameters?: unknown[]): Promise<any> };
type ResourceRow = { id: number; public_id: string; user_id: number; resource_kind: string; status?: string };
type VersionRow = {
  id: number; public_id: string; status: string; version?: string; release_channel?: string;
  file_path?: string | null; file_name?: string | null; file_size?: number | null;
  mime_type?: string | null; content_hash?: string | null;
};
type AnalysisRunRow = { id: number; parser_version: string; findings_json: unknown };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ANALYZERS: Record<string, string> = {
  mod: 'mod-static-analysis',
  schematic: 'schematic-static-analysis',
  map: 'map-static-analysis',
};

@Injectable()
export class ResourceV2ReviewService {
  private readonly logger = new Logger(ResourceV2ReviewService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly storage?: ResourceStorageService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async reviewVersion(resourcePublicId: string, versionPublicId: string, actorId: number, input: {
    action: 'approve' | 'reject' | 'request_changes'; reason?: string;
  }): Promise<Record<string, unknown>> {
    this.assertActor(actorId);
    const action = input?.action;
    if (!['approve', 'reject', 'request_changes'].includes(action)) throw new BadRequestException('版本审核动作无效');
    const reason = input.reason?.trim() || null;
    if (reason && reason.length > 5_000) throw new BadRequestException('审核说明不能超过 5000 个字符');
    if (action !== 'approve' && !reason) throw new BadRequestException('拒绝或要求修改时必须填写原因');

    let preparedPromotion: PreparedResourcePromotion | null = null;
    let preparedSource: { filePath: string; fileSize: number; contentHash: string } | null = null;
    if (action === 'approve') {
      // Validate and copy outside the transaction. The source remains in
      // quarantine until the database transaction commits successfully.
      const preflightResource = await this.getResource(this.dataSource, resourcePublicId, false);
      await this.assertStaff(this.dataSource, actorId);
      const preflightVersion = await this.getVersion(this.dataSource, preflightResource.id, versionPublicId, false);
      if (preflightVersion.status !== 'pending_review') {
        throw new BadRequestException('只有 pending_review 状态的版本可以审核');
      }
      if (preflightVersion.file_path) {
        if (!this.storage) throw new BadRequestException('资源文件存储服务不可用，无法发布此版本');
        const bytes = await this.storage.readQuarantinedFile(preflightVersion.file_path, 50 * 1024 * 1024);
        const fileSize = Number(preflightVersion.file_size);
        const contentHash = String(preflightVersion.content_hash || '').toLowerCase();
        if (!Number.isSafeInteger(fileSize) || fileSize < 1 || bytes.length !== fileSize) {
          throw new BadRequestException('资源文件大小校验失败，无法发布此版本');
        }
        if (!/^[a-f0-9]{64}$/.test(contentHash)
          || createHash('sha256').update(bytes).digest('hex') !== contentHash) {
          throw new BadRequestException('资源文件 SHA256 校验失败，无法发布此版本');
        }
        preparedPromotion = await this.storage.preparePromotion(preflightVersion.file_path);
        preparedSource = { filePath: preflightVersion.file_path, fileSize, contentHash };
      }
    }

    const outcome = await this.dataSource.transaction(async (manager) => {
      const resource = await this.getResource(manager, resourcePublicId, true);
      const reviewer = await this.assertStaff(manager, actorId);
      const version = await this.getVersion(manager, resource.id, versionPublicId, false);
      if (version.status !== 'pending_review') {
        throw new BadRequestException('只有 pending_review 状态的版本可以审核');
      }
      if (action === 'approve' && Boolean(version.file_path) !== Boolean(preparedSource)) {
        throw new BadRequestException('待发布版本的文件信息已变化，请重新审核');
      }
      if (action === 'approve' && version.file_path) {
        if (!preparedPromotion || !preparedSource
          || path.resolve(version.file_path) !== path.resolve(preparedSource.filePath)
          || Number(version.file_size) !== preparedSource.fileSize
          || String(version.content_hash || '').toLowerCase() !== preparedSource.contentHash) {
          throw new BadRequestException('待发布版本的文件信息已变化，请重新审核');
        }
      }

      const nextStatus = action === 'approve' ? 'published'
        : action === 'reject' ? 'rejected' : 'changes_requested';
      const isRecommended = action === 'approve' && ['release', 'stable'].includes(version.release_channel || 'release');
      const promotedPath = action === 'approve' ? preparedPromotion?.targetPath : null;
      if (isRecommended) {
        await manager.query(
          `UPDATE resource_versions SET recommended=0
           WHERE resource_id=? AND id<>? AND recommended=1`,
          [resource.id, version.id],
        );
      }
      await manager.query(
        `UPDATE resource_versions SET status=?,published_at=${action === 'approve' ? 'NOW(6)' : 'NULL'},recommended=?,
           reviewed_by_user_id=?,reviewed_at=NOW(6),reject_reason=?${promotedPath ? ',file_path=?' : ''}
         WHERE resource_id=? AND id=? AND status='pending_review'`,
        [
          nextStatus, isRecommended ? 1 : 0, actorId,
          action === 'reject' || action === 'request_changes' ? reason : null,
          ...(promotedPath ? [promotedPath] : []), resource.id, version.id,
        ],
      );
      if (promotedPath && promotedPath !== version.file_path) {
        await manager.query(
          `UPDATE resource_files SET storage_key=?
           WHERE resource_version_id=? AND storage_key=? AND delivery_mode='managed'`,
          [promotedPath, version.id, version.file_path],
        );
      }
      if (action === 'approve') {
        if (promotedPath) {
          await manager.query(
            `UPDATE resources SET latest_published_version_id=?,file_path=?,file_name=?,file_size=?,mime_type=?,content_hash=?
             WHERE id=? AND deleted_at IS NULL`,
            [version.id, promotedPath, version.file_name, version.file_size, version.mime_type, version.content_hash, resource.id],
          );
        } else {
          await manager.query(
            'UPDATE resources SET latest_published_version_id=? WHERE id=? AND deleted_at IS NULL',
            [version.id, resource.id],
          );
        }
      }

      await this.writeEvent(manager, {
        resourceId: resource.id,
        versionId: version.id,
        actorId,
        eventType: action === 'approve' ? 'version_review_approved'
          : action === 'reject' ? 'version_review_rejected' : 'version_changes_requested',
        result: nextStatus,
        payload: { reason, action, reviewer_role: reviewer.role },
      });
      await this.writeAudit(manager, actorId, resource.id, `resource.version.review.${action}`, {
        version_public_id: version.public_id,
        action,
        status: nextStatus,
        reason,
      });
      const maintainers = await manager.query(
        `SELECT user_id FROM resource_members
         WHERE resource_id=? AND role IN ('owner','maintainer') AND status='active' AND user_id IS NOT NULL`,
        [resource.id],
      ) as Array<{ user_id: number }>;
      return {
        resource_public_id: resource.public_id,
        version_public_id: version.public_id,
        action,
        status: nextStatus,
        published_at: action === 'approve' ? new Date().toISOString() : null,
        recommended: Boolean(isRecommended),
        notify_user_ids: [...new Set([Number(resource.user_id), ...maintainers.map((member) => Number(member.user_id))])],
      };
    });

    if (preparedPromotion && this.storage) {
      try {
        await this.storage.removeQuarantinedFile(preparedPromotion.sourcePath);
      } catch (error) {
        this.logger.warn(`Resource version was published, but quarantine cleanup failed: ${(error as Error).message}`);
      }
    }

    if (this.notifications) {
      const decision = action === 'approve' ? '已审核通过并发布'
        : action === 'reject' ? '未通过审核' : '需要修改后重新提交';
      const content = `Resource ${outcome.resource_public_id} 的版本 ${outcome.version_public_id}${decision}${reason ? `：${reason}` : '。'}`;
      await Promise.all(outcome.notify_user_ids.map((userId) => this.notifications!.create({
        user_id: userId,
        type: 'system',
        content,
        emailEvent: false,
        deduplicationKey: `resource-version-review:${action}:${outcome.version_public_id}:${userId}`,
      }).catch((error) => this.logger.warn(`Failed to notify Resource members after version review: ${(error as Error).message}`))));
    }
    const { notify_user_ids: _notifyUserIds, ...response } = outcome;
    return response;
  }

  async setFindingIgnore(resourcePublicId: string, versionPublicId: string, actorId: number, input: { finding_key: string; reason: string }) {
    this.assertActor(actorId);
    const findingKey = this.requiredText(input?.finding_key, 191, 'finding_key');
    const reason = this.requiredText(input?.reason, 5_000, 'reason');
    return this.dataSource.transaction(async (manager) => {
      const resource = await this.getResource(manager, resourcePublicId, true);
      await this.assertOwnerOrMaintainer(manager, resource, actorId);
      const version = await this.getVersion(manager, resource.id, versionPublicId, true);
      const run = await this.findAnalysisRun(manager, resource, version, findingKey);
      const finding = this.getFinding(run.findings_json, findingKey);
      if (!['ERROR', 'WARNING'].includes(this.severity(finding.severity))) {
        throw new BadRequestException('只有 ERROR 或 WARNING 分析结果可以忽略');
      }

      await manager.query(
        `INSERT INTO resource_analysis_overrides (analysis_run_id,finding_key,actor_user_id,reason,created_at)
         VALUES (?,?,?,?,NOW(6))
         ON DUPLICATE KEY UPDATE actor_user_id=VALUES(actor_user_id),reason=VALUES(reason),created_at=NOW(6)`,
        [run.id, findingKey, actorId, reason],
      );
      await this.writeEvent(manager, {
        resourceId: resource.id, versionId: version.id, actorId,
        eventType: 'analysis_finding_ignored', result: 'ignored',
        payload: { finding_key: findingKey, reason, parser_version: run.parser_version },
      });
      await this.writeAudit(manager, actorId, resource.id, 'resource.analysis.finding.ignore', {
        version_public_id: version.public_id, finding_key: findingKey, parser_version: run.parser_version,
      });

      const rows = await manager.query(
        `SELECT override.reason,override.created_at,user.username AS actor
         FROM resource_analysis_overrides override LEFT JOIN users user ON user.id=override.actor_user_id
         WHERE override.analysis_run_id=? AND override.finding_key=? LIMIT 1`,
        [run.id, findingKey],
      ) as Array<{ reason: string; created_at: Date | string; actor: string | null }>;
      const current = rows[0];
      return {
        resource_public_id: resource.public_id,
        version_public_id: version.public_id,
        finding_key: findingKey,
        severity: this.severity(finding.severity),
        ignored: true,
        reason: current?.reason || reason,
        actor: current?.actor || null,
        timestamp: this.iso(current?.created_at) || new Date().toISOString(),
        parser_version: run.parser_version,
      };
    });
  }

  async clearFindingIgnore(resourcePublicId: string, versionPublicId: string, actorId: number, input: { finding_key: string; reason?: string | null }) {
    this.assertActor(actorId);
    const findingKey = this.requiredText(input?.finding_key, 191, 'finding_key');
    const reason = input?.reason == null ? null : this.optionalText(input.reason, 5_000, 'reason');
    return this.dataSource.transaction(async (manager) => {
      const resource = await this.getResource(manager, resourcePublicId, true);
      await this.assertOwnerOrMaintainer(manager, resource, actorId);
      const version = await this.getVersion(manager, resource.id, versionPublicId, true);
      const run = await this.findAnalysisRun(manager, resource, version, findingKey);
      const finding = this.getFinding(run.findings_json, findingKey);
      if (!['ERROR', 'WARNING'].includes(this.severity(finding.severity))) {
        throw new BadRequestException('只有 ERROR 或 WARNING 分析结果可以忽略');
      }

      const deleted = await manager.query(
        'DELETE FROM resource_analysis_overrides WHERE analysis_run_id=? AND finding_key=?',
        [run.id, findingKey],
      );
      await this.writeEvent(manager, {
        resourceId: resource.id, versionId: version.id, actorId,
        eventType: 'analysis_finding_unignored', result: 'unignored',
        payload: { finding_key: findingKey, reason, parser_version: run.parser_version },
      });
      await this.writeAudit(manager, actorId, resource.id, 'resource.analysis.finding.unignore', {
        version_public_id: version.public_id, finding_key: findingKey, parser_version: run.parser_version,
        changed: this.affectedRows(deleted) > 0,
      });
      return {
        resource_public_id: resource.public_id,
        version_public_id: version.public_id,
        finding_key: findingKey,
        severity: this.severity(finding.severity),
        ignored: false,
        changed: this.affectedRows(deleted) > 0,
        reason,
        parser_version: run.parser_version,
      };
    });
  }

  async addFieldAnnotation(resourcePublicId: string, actorId: number, input: {
    version_public_id?: string; field_path: string; severity: 'ERROR' | 'WARNING' | 'INFO'; body: string;
  }) {
    this.assertActor(actorId);
    const fieldPath = this.requiredText(input?.field_path, 191, 'field_path');
    if (/[\u0000-\u001f\u007f]/.test(fieldPath)) throw new BadRequestException('field_path 格式无效');
    const severity = String(input?.severity || '').toUpperCase();
    if (!['ERROR', 'WARNING', 'INFO'].includes(severity)) throw new BadRequestException('批注严重度无效');
    const body = this.requiredText(input?.body, 20_000, 'body');

    return this.dataSource.transaction(async (manager) => {
      const resource = await this.getResource(manager, resourcePublicId, true);
      const actor = await this.assertStaff(manager, actorId);
      const version = input.version_public_id
        ? await this.getVersion(manager, resource.id, input.version_public_id, false)
        : null;
      const parserVersion = version ? await this.getParserVersion(manager, resource.id, version.id) : null;
      const eventPayload = { field_path: fieldPath, severity, body, parser_version: parserVersion };
      const insertResult = await manager.query(
        `INSERT INTO resource_review_events (resource_id,resource_version_id,actor_user_id,event_type,result,reason,created_at)
         VALUES (?,?,?,'field_annotation',?,?,NOW(6))`,
        [resource.id, version?.id || null, actorId, severity, JSON.stringify(eventPayload)],
      );
      const eventId = await this.resolveInsertedEventId(manager, insertResult, resource.id, actorId);
      await manager.query(
        `INSERT INTO resource_review_annotations (review_event_id,resource_id,field_path,severity,body,created_by_user_id,created_at)
         VALUES (?,?,?,?,?,?,NOW(6))`,
        [eventId, resource.id, fieldPath, severity, body, actorId],
      );
      await this.writeAudit(manager, actorId, resource.id, 'resource.review.annotation.create', {
        version_public_id: version?.public_id || null, field_path: fieldPath, severity, parser_version: parserVersion,
      });
      const rows = await manager.query(
        'SELECT created_at FROM resource_review_annotations WHERE review_event_id=? LIMIT 1', [eventId],
      ) as Array<{ created_at: Date | string }>;
      return {
        resource_public_id: resource.public_id,
        version_public_id: version?.public_id || null,
        field_path: fieldPath,
        severity,
        body,
        actor: actor.username || null,
        timestamp: this.iso(rows[0]?.created_at) || new Date().toISOString(),
        parser_version: parserVersion,
      };
    });
  }

  async getReviewTimeline(resourcePublicId: string, actorId: number, query: { version_public_id?: string; limit?: number; offset?: number }) {
    this.assertActor(actorId);
    const resource = await this.getResource(this.dataSource, resourcePublicId, false);
    await this.assertCanViewTimeline(this.dataSource, resource, actorId);
    const version = query.version_public_id
      ? await this.getVersion(this.dataSource, resource.id, query.version_public_id, false)
      : null;
    const limit = this.integerBound(query.limit, 50, 1, 100);
    const offset = this.integerBound(query.offset, 0, 0, 100_000);
    const parameters: unknown[] = [resource.id];
    const clauses = ['event.resource_id=?'];
    if (version) {
      clauses.push('event.resource_version_id=?');
      parameters.push(version.id);
    }
    parameters.push(limit + 1, offset);
    const rows = await this.dataSource.query(
      `SELECT event.event_type,event.result,event.reason,event.created_at,
              actor.username AS actor_name,version.public_id AS version_public_id,
              (SELECT run.parser_version FROM resource_analysis_runs run
               WHERE run.resource_id=event.resource_id AND run.resource_version_id=event.resource_version_id
               ORDER BY run.created_at DESC,run.id DESC LIMIT 1) AS latest_parser_version,
              annotation.field_path,annotation.severity AS annotation_severity,annotation.body AS annotation_body
       FROM resource_review_events event
       LEFT JOIN users actor ON actor.id=event.actor_user_id
       LEFT JOIN resource_versions version ON version.id=event.resource_version_id
       LEFT JOIN resource_review_annotations annotation ON annotation.review_event_id=event.id
       WHERE ${clauses.join(' AND ')}
       ORDER BY event.created_at DESC,event.id DESC LIMIT ? OFFSET ?`,
      parameters,
    ) as Array<Record<string, unknown>>;
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((row) => this.publicTimelineEvent(resource.public_id, row));
    return { items, pagination: { limit, offset, has_more: hasMore } };
  }

  private async getResource(executor: SqlExecutor, publicId: string, lock: boolean): Promise<ResourceRow> {
    this.assertUuid(publicId, 'Resource');
    const rows = await executor.query(
      `SELECT id,public_id,user_id,resource_kind,status FROM resources
       WHERE public_id=? AND deleted_at IS NULL LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      [publicId],
    ) as ResourceRow[];
    if (!rows[0]) throw new NotFoundException('资源不存在');
    return rows[0];
  }

  private async getVersion(executor: SqlExecutor, resourceId: number, publicId: string, publishedOnly: boolean): Promise<VersionRow> {
    this.assertUuid(publicId, 'Version');
    const rows = await executor.query(
      `SELECT id,public_id,status,version,release_channel,file_path,file_name,file_size,mime_type,content_hash FROM resource_versions
       WHERE resource_id=? AND public_id=?${publishedOnly ? " AND status='published'" : ''} LIMIT 1${executor !== this.dataSource ? ' FOR UPDATE' : ''}`,
      [resourceId, publicId],
    ) as VersionRow[];
    if (!rows[0]) throw new NotFoundException(publishedOnly ? '已发布版本不存在' : '版本不存在');
    return rows[0];
  }

  private async assertOwnerOrMaintainer(executor: SqlExecutor, resource: ResourceRow, actorId: number): Promise<void> {
    if (Number(resource.user_id) === actorId) return;
    const rows = await executor.query(
      `SELECT role FROM resource_members WHERE resource_id=? AND user_id=? AND status='active' LIMIT 1 FOR UPDATE`,
      [resource.id, actorId],
    ) as Array<{ role: string }>;
    if (!['owner', 'maintainer'].includes(String(rows[0]?.role || ''))) {
      throw new ForbiddenException('只有 Resource Owner 或 Maintainer 可以忽略分析结果');
    }
  }

  private async assertStaff(executor: SqlExecutor, actorId: number): Promise<{ username: string | null; role: string }> {
    const rows = await executor.query(`SELECT username,role FROM users WHERE id=? LIMIT 1${executor !== this.dataSource ? ' FOR UPDATE' : ''}`, [actorId]) as Array<{ username: string | null; role: string }>;
    const actor = rows[0];
    if (!actor || !['admin', 'moderator'].includes(String(actor.role || ''))) {
      throw new ForbiddenException('只有管理员或版主可以添加审核批注');
    }
    return actor;
  }

  private async assertCanViewTimeline(executor: SqlExecutor, resource: ResourceRow, actorId: number): Promise<void> {
    const actorRows = await executor.query('SELECT role FROM users WHERE id=? LIMIT 1', [actorId]) as Array<{ role: string }>;
    if (['admin', 'moderator'].includes(String(actorRows[0]?.role || '')) || Number(resource.user_id) === actorId) return;
    const memberships = await executor.query(
      "SELECT role FROM resource_members WHERE resource_id=? AND user_id=? AND status='active' LIMIT 1",
      [resource.id, actorId],
    ) as Array<{ role: string }>;
    if (!['owner', 'maintainer', 'publisher'].includes(String(memberships[0]?.role || ''))) {
      throw new ForbiddenException('只有 Resource 成员或审核人员可以读取审核时间线');
    }
  }

  private async findAnalysisRun(executor: SqlExecutor, resource: ResourceRow, version: VersionRow, findingKey: string): Promise<AnalysisRunRow> {
    const analyzer = ANALYZERS[resource.resource_kind];
    if (!analyzer) throw new BadRequestException('该资源类型没有可忽略的静态分析结果');
    const rows = await executor.query(
      `SELECT id,parser_version,findings_json FROM resource_analysis_runs
       WHERE resource_id=? AND resource_version_id=? AND analyzer=?
       ORDER BY created_at DESC,id DESC LIMIT 1${executor !== this.dataSource ? ' FOR UPDATE' : ''}`,
      [resource.id, version.id, analyzer],
    ) as AnalysisRunRow[];
    if (!rows[0]) throw new NotFoundException('该版本尚无分析结果');
    // Check existence before mutation so callers cannot create overrides for arbitrary keys.
    this.getFinding(rows[0].findings_json, findingKey);
    return rows[0];
  }

  private getFinding(raw: unknown, key: string): Record<string, unknown> {
    const findings = this.asArray(raw);
    const finding = findings.find((item, index) => this.findingKey(item, index) === key);
    if (!finding) throw new NotFoundException('分析结果中不存在该 finding_key');
    return finding;
  }

  private findingKey(finding: unknown, index: number): string {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding)) return `finding-${index + 1}`;
    const row = finding as Record<string, unknown>;
    return String(row.key || row.finding_key || row.code || `finding-${index + 1}`);
  }

  private async getParserVersion(executor: SqlExecutor, resourceId: number, versionId: number): Promise<string | null> {
    const rows = await executor.query(
      `SELECT parser_version FROM resource_analysis_runs WHERE resource_id=? AND resource_version_id=?
       ORDER BY created_at DESC,id DESC LIMIT 1`, [resourceId, versionId],
    ) as Array<{ parser_version: string | null }>;
    return rows[0]?.parser_version || null;
  }

  private async writeEvent(executor: SqlExecutor, input: {
    resourceId: number; versionId: number; actorId: number; eventType: string; result: string; payload: Record<string, unknown>;
  }): Promise<void> {
    await executor.query(
      `INSERT INTO resource_review_events (resource_id,resource_version_id,actor_user_id,event_type,result,reason,created_at)
       VALUES (?,?,?,?,?,?,NOW(6))`,
      [input.resourceId, input.versionId, input.actorId, input.eventType, input.result, JSON.stringify(input.payload)],
    );
  }

  private async writeAudit(executor: SqlExecutor, actorId: number, resourceId: number, action: string, details: Record<string, unknown>): Promise<void> {
    await executor.query(
      `INSERT INTO operation_logs (user_id,action,target_type,target_id,details,created_at)
       VALUES (?,?,'resource',?,?,NOW(6))`,
      [actorId, action, resourceId, JSON.stringify(details)],
    );
  }

  private async resolveInsertedEventId(executor: SqlExecutor, result: unknown, resourceId: number, actorId: number): Promise<number> {
    const candidates = Array.isArray(result) ? result.flat(Infinity) : [result];
    const packet = candidates.find((candidate) => candidate && typeof candidate === 'object' && Number((candidate as any).insertId) > 0) as { insertId?: unknown } | undefined;
    const insertId = Number(packet?.insertId);
    if (Number.isSafeInteger(insertId) && insertId > 0) return insertId;
    // The resource row is locked by the surrounding transaction, so this fallback is serialized per Resource.
    const rows = await executor.query(
      `SELECT id FROM resource_review_events WHERE resource_id=? AND actor_user_id=? AND event_type='field_annotation'
       ORDER BY id DESC LIMIT 1 FOR UPDATE`, [resourceId, actorId],
    ) as Array<{ id: number }>;
    const id = Number(rows[0]?.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Could not resolve inserted review event');
    return id;
  }

  private publicTimelineEvent(resourcePublicId: string, row: Record<string, unknown>): Record<string, unknown> {
    const rawReason = row.reason == null ? null : String(row.reason);
    const payload = this.parseObject(rawReason);
    const annotation = row.field_path == null ? null : {
      field_path: String(row.field_path),
      severity: this.severity(row.annotation_severity),
      body: String(row.annotation_body || ''),
    };
    return {
      resource_public_id: resourcePublicId,
      version_public_id: this.isUuid(row.version_public_id) ? String(row.version_public_id) : null,
      event_type: String(row.event_type || ''),
      result: row.result == null ? null : String(row.result),
      reason: typeof payload?.reason === 'string' ? payload.reason : annotation ? null : rawReason,
      finding_key: typeof payload?.finding_key === 'string' ? payload.finding_key : null,
      annotation,
      actor: row.actor_name ? String(row.actor_name) : null,
      timestamp: this.iso(row.created_at),
      parser_version: typeof payload?.parser_version === 'string'
        ? payload.parser_version
        : typeof row.latest_parser_version === 'string' ? row.latest_parser_version : null,
    };
  }

  private parseObject(raw: string | null): Record<string, unknown> | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }

  private asArray(raw: unknown): Array<Record<string, unknown>> {
    let value = raw;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return []; }
    }
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      : [];
  }

  private severity(value: unknown): 'ERROR' | 'WARNING' | 'INFO' {
    const normalized = String(value || '').toUpperCase();
    return normalized === 'ERROR' || normalized === 'WARNING' ? normalized : 'INFO';
  }

  private requiredText(value: unknown, maxLength: number, field: string): string {
    if (typeof value !== 'string') throw new BadRequestException(`${field} 必须是文本`);
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) throw new BadRequestException(`${field} 长度无效`);
    return normalized;
  }

  private optionalText(value: string, maxLength: number, field: string): string | null {
    const normalized = value.trim();
    if (normalized.length > maxLength) throw new BadRequestException(`${field} 长度无效`);
    return normalized || null;
  }

  private assertUuid(value: string, label: string): void {
    if (typeof value !== 'string' || !UUID_RE.test(value)) throw new BadRequestException(`${label} public ID 必须是 UUID`);
  }

  private assertActor(actorId: number): void {
    if (!Number.isSafeInteger(actorId) || actorId <= 0) throw new ForbiddenException('需要有效的登录账号');
  }

  private integerBound(value: unknown, defaultValue: number, min: number, max: number): number {
    const number = value == null ? defaultValue : Number(value);
    if (!Number.isInteger(number) || number < min || number > max) throw new BadRequestException('分页参数无效');
    return number;
  }

  private affectedRows(result: unknown): number {
    const candidates = Array.isArray(result) ? result.flat(Infinity) : [result];
    const packet = candidates.find((candidate) => candidate && typeof candidate === 'object' && 'affectedRows' in candidate) as { affectedRows?: unknown } | undefined;
    return Number(packet?.affectedRows || 0);
  }

  private iso(value: unknown): string | null {
    if (value == null) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private isUuid(value: unknown): boolean {
    return typeof value === 'string' && UUID_RE.test(value);
  }
}

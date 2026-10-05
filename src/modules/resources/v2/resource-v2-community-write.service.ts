import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';

type QueryExecutor = Pick<DataSource, 'query'> | Pick<EntityManager, 'query'>;
export type CommunityReportStatus = 'working' | 'partial' | 'cannot_start' | 'crash' | 'performance' | 'multiplayer';
export type AuthorResponseStatus = 'confirmed' | 'cannot_reproduce' | 'fixed' | 'not_mod_issue';

export type MapFeedbackInput = {
  difficulty?: number | null;
  resource_sufficiency?: number | null;
  balance?: number | null;
  multiplayer_experience?: number | null;
  body?: string | null;
};

export type ModCompatibilityReportInput = {
  status: CommunityReportStatus;
  game_version?: string | null;
  platform_key?: string | null;
  runtime?: 'java' | 'js' | 'hybrid' | 'content' | null;
  body?: string | null;
};

export type ModIssueReportInput = {
  title: string;
  body: string;
};

export type AuthorResponseInput = {
  author_response_status: AuthorResponseStatus;
  author_response?: string | null;
  fixed_resource_version_public_id?: string | null;
};

export type ModConflictReportInput = {
  title?: string | null;
  body?: string | null;
  game_version_min?: string | null;
  game_version_max?: string | null;
  members: Array<{ resource_public_id: string; version_public_id: string; version_constraint?: string | null }>;
};

export type ModConflictAuthorResponseInput = AuthorResponseInput & {
  fixed_resource_public_id?: string | null;
};

type ResourceRow = { id: number; user_id: number; resource_kind: string; public_id: string };
type VersionRow = { id: number; resource_id: number; public_id: string; status: string };
type ReportRow = Record<string, any>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPATIBILITY_STATUSES = new Set<CommunityReportStatus>(['working', 'partial', 'cannot_start', 'crash', 'performance', 'multiplayer']);
const AUTHOR_RESPONSE_STATUSES = new Set<AuthorResponseStatus>(['confirmed', 'cannot_reproduce', 'fixed', 'not_mod_issue']);
const RATINGS = ['difficulty', 'resource_sufficiency', 'balance', 'multiplayer_experience'] as const;

/** Community write paths for V2 resources. Public identifiers are resolved before persistence. */
@Injectable()
export class ResourceV2CommunityWriteService {
  constructor(private readonly dataSource: DataSource) {}

  async upsertMapFeedback(resourcePublicId: string, versionPublicId: string, actorUserId: number, input: MapFeedbackInput) {
    const actorId = this.assertActor(actorUserId);
    await this.assertPhoneVerified(actorId);
    const resource = await this.getPublicResource(this.dataSource, resourcePublicId, 'map');
    const version = await this.getPublishedVersion(this.dataSource, resource.id, versionPublicId);
    const normalized = this.normalizeFeedback(input);

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO map_feedback
          (resource_id,resource_version_id,user_id,difficulty,resource_sufficiency,balance,multiplayer_experience,body,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,NOW(6),NOW(6))
         ON DUPLICATE KEY UPDATE difficulty=VALUES(difficulty),resource_sufficiency=VALUES(resource_sufficiency),
          balance=VALUES(balance),multiplayer_experience=VALUES(multiplayer_experience),body=VALUES(body),updated_at=NOW(6)`,
        [resource.id, version.id, actorId, normalized.difficulty, normalized.resource_sufficiency,
          normalized.balance, normalized.multiplayer_experience, normalized.body],
      );
      await this.audit(manager, {
        actorId, action: 'resource.map_feedback.upsert', resourceId: resource.id, versionId: version.id,
        eventType: 'map_feedback_upsert', result: 'submitted',
        details: { resource_public_id: resource.public_id, version_public_id: version.public_id },
      });
    });

    return {
      resource_public_id: resource.public_id,
      version_public_id: version.public_id,
      aggregate: await this.aggregateMapFeedback(resource.id, version.id),
    };
  }

  async getMapFeedbackAggregate(resourcePublicId: string, versionPublicId: string) {
    const resource = await this.getPublicResource(this.dataSource, resourcePublicId, 'map');
    const version = await this.getPublishedVersion(this.dataSource, resource.id, versionPublicId);
    return {
      resource_public_id: resource.public_id,
      version_public_id: version.public_id,
      aggregate: await this.aggregateMapFeedback(resource.id, version.id),
    };
  }

  async submitModCompatibilityReport(resourcePublicId: string, versionPublicId: string, actorUserId: number, input: ModCompatibilityReportInput) {
    const actorId = this.assertActor(actorUserId);
    await this.assertPhoneVerified(actorId);
    const resource = await this.getPublicResource(this.dataSource, resourcePublicId, 'mod');
    const version = await this.getPublishedVersion(this.dataSource, resource.id, versionPublicId);
    const normalized = this.normalizeCompatibility(input);
    const newPublicId = randomUUID();

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO mod_compatibility_reports
          (public_id,resource_id,resource_version_id,user_id,status,game_version,platform_key,runtime,body,attachment_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,NOW(6),NOW(6))
         ON DUPLICATE KEY UPDATE status=VALUES(status),game_version=VALUES(game_version),platform_key=VALUES(platform_key),
          runtime=VALUES(runtime),body=VALUES(body),updated_at=NOW(6)`,
        [newPublicId, resource.id, version.id, actorId, normalized.status, normalized.game_version,
          normalized.platform_key, normalized.runtime, normalized.body, null],
      );
      const rows = await this.rows<ReportRow>(manager, 'SELECT public_id FROM mod_compatibility_reports WHERE resource_version_id = ? AND user_id = ? LIMIT 1', [version.id, actorId]);
      if (!rows[0] || !this.isUuid(rows[0].public_id)) throw new Error('Compatibility report was not persisted');
      await this.audit(manager, {
        actorId, action: 'resource.mod_compatibility.submit', resourceId: resource.id, versionId: version.id,
        eventType: 'mod_compat_report', result: normalized.status,
        details: { report_public_id: String(rows[0].public_id), version_public_id: version.public_id },
      });
      normalized.public_id = String(rows[0].public_id);
    });
    return { public_id: normalized.public_id, resource_public_id: resource.public_id, version_public_id: version.public_id, status: normalized.status };
  }

  async updateModCompatibilityReport(reportPublicId: string, actorUserId: number, input: ModCompatibilityReportInput) {
    const actorId = this.assertActor(actorUserId);
    await this.assertPhoneVerified(actorId);
    this.assertUuid(reportPublicId, 'Report');
    const normalized = this.normalizeCompatibility(input);
    return this.dataSource.transaction(async (manager) => {
      const rows = await this.rows<ReportRow>(manager,
        `SELECT report.public_id,report.resource_id,report.resource_version_id,resource.public_id AS resource_public_id,version.public_id AS version_public_id
         FROM mod_compatibility_reports report
         JOIN resources resource ON resource.id=report.resource_id
         JOIN resource_versions version ON version.id=report.resource_version_id
         WHERE report.public_id=? AND report.user_id=? LIMIT 1 FOR UPDATE`, [reportPublicId, actorId]);
      const report = rows[0];
      if (!report) throw new NotFoundException('兼容性报告不存在');
      await manager.query(
        `UPDATE mod_compatibility_reports SET status=?,game_version=?,platform_key=?,runtime=?,body=?,updated_at=NOW(6) WHERE public_id=? AND user_id=?`,
        [normalized.status, normalized.game_version, normalized.platform_key, normalized.runtime, normalized.body, reportPublicId, actorId],
      );
      await this.audit(manager, {
        actorId, action: 'resource.mod_compatibility.update', resourceId: Number(report.resource_id), versionId: Number(report.resource_version_id),
        eventType: 'mod_compat_update', result: normalized.status,
        details: { report_public_id: reportPublicId },
      });
      return { public_id: reportPublicId, resource_public_id: String(report.resource_public_id), version_public_id: String(report.version_public_id), status: normalized.status };
    });
  }

  async submitModIssueReport(resourcePublicId: string, versionPublicId: string, actorUserId: number, input: ModIssueReportInput) {
    const actorId = this.assertActor(actorUserId);
    await this.assertPhoneVerified(actorId);
    const resource = await this.getPublicResource(this.dataSource, resourcePublicId, 'mod');
    const version = await this.getPublishedVersion(this.dataSource, resource.id, versionPublicId);
    const normalized = this.normalizeIssue(input);
    const publicId = randomUUID();
    let persistedPublicId: string = publicId;
    let persistedStatus = 'open';
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO mod_issue_reports (public_id,resource_id,resource_version_id,user_id,status,title,body,attachment_json,created_at,updated_at)
         VALUES (?,?,?,?,'open',?,?,?,NOW(6),NOW(6))
         ON DUPLICATE KEY UPDATE title=VALUES(title),body=VALUES(body),updated_at=NOW(6)`,
        [publicId, resource.id, version.id, actorId, normalized.title, normalized.body, null],
      );
      const rows = await this.rows<ReportRow>(manager,
        'SELECT public_id,status FROM mod_issue_reports WHERE resource_version_id=? AND user_id=? LIMIT 1', [version.id, actorId]);
      const reportPublicId = String(rows[0]?.public_id || '');
      const status = String(rows[0]?.status || 'open');
      if (!this.isUuid(reportPublicId)) throw new Error('Issue report was not persisted');
      await this.audit(manager, {
        actorId, action: 'resource.mod_issue.submit', resourceId: resource.id, versionId: version.id,
        eventType: 'mod_issue_submit', result: status, details: { report_public_id: reportPublicId, version_public_id: version.public_id },
      });
      persistedPublicId = reportPublicId;
      persistedStatus = status;
    });
    return { public_id: persistedPublicId, resource_public_id: resource.public_id, version_public_id: version.public_id, status: persistedStatus };
  }

  async updateModIssueReport(reportPublicId: string, actorUserId: number, input: ModIssueReportInput) {
    const actorId = this.assertActor(actorUserId);
    await this.assertPhoneVerified(actorId);
    this.assertUuid(reportPublicId, 'Report');
    const normalized = this.normalizeIssue(input);
    return this.dataSource.transaction(async (manager) => {
      const rows = await this.rows<ReportRow>(manager,
        `SELECT report.public_id,report.resource_id,report.resource_version_id,resource.public_id AS resource_public_id,version.public_id AS version_public_id,report.status
         FROM mod_issue_reports report
         JOIN resources resource ON resource.id=report.resource_id
         JOIN resource_versions version ON version.id=report.resource_version_id
         WHERE report.public_id=? AND report.user_id=? LIMIT 1 FOR UPDATE`, [reportPublicId, actorId]);
      const report = rows[0];
      if (!report) throw new NotFoundException('问题报告不存在');
      await manager.query(
        `UPDATE mod_issue_reports SET title=?,body=?,updated_at=NOW(6) WHERE public_id=? AND user_id=?`,
        [normalized.title, normalized.body, reportPublicId, actorId],
      );
      await this.audit(manager, {
        actorId, action: 'resource.mod_issue.update', resourceId: Number(report.resource_id), versionId: Number(report.resource_version_id),
        eventType: 'mod_issue_update', result: String(report.status || 'open'), details: { report_public_id: reportPublicId },
      });
      return { public_id: reportPublicId, resource_public_id: String(report.resource_public_id), version_public_id: String(report.version_public_id), status: String(report.status || 'open') };
    });
  }

  async respondToModCompatibilityReport(reportPublicId: string, actorUserId: number, input: AuthorResponseInput) {
    return this.respondToResourceModReport('mod_compatibility_reports', 'compatibility', reportPublicId, actorUserId, input);
  }

  async respondToModIssueReport(reportPublicId: string, actorUserId: number, input: AuthorResponseInput) {
    return this.respondToResourceModReport('mod_issue_reports', 'issue', reportPublicId, actorUserId, input);
  }

  async submitModConflictReport(actorUserId: number, input: ModConflictReportInput) {
    const actorId = this.assertActor(actorUserId);
    await this.assertPhoneVerified(actorId);
    const normalized = this.normalizeConflict(input);
    const reportPublicId = randomUUID();
    return this.dataSource.transaction(async (manager) => {
      const resolved: Array<{ resource: ResourceRow; version: VersionRow; version_constraint: string | null }> = [];
      for (const member of normalized.members) {
        const resource = await this.getPublicResource(manager, member.resource_public_id, 'mod');
        const version = await this.getPublishedVersion(manager, resource.id, member.version_public_id);
        resolved.push({ resource, version, version_constraint: member.version_constraint });
      }
      if (new Set(resolved.map(item => item.resource.id)).size < 2 || new Set(resolved.map(item => item.version.id)).size < 2) {
        throw new BadRequestException('冲突报告至少需要两个不同 Mod 的已发布版本');
      }

      await manager.query(
        `INSERT INTO mod_conflict_reports
          (public_id,reporter_user_id,status,title,body,game_version_min,game_version_max,created_at,updated_at)
         VALUES (?,?,'unverified',?,?,?,?,NOW(6),NOW(6))`,
        [reportPublicId, actorId, normalized.title, normalized.body, normalized.game_version_min, normalized.game_version_max],
      );
      const reportRows = await this.rows<ReportRow>(manager, 'SELECT id FROM mod_conflict_reports WHERE public_id=? LIMIT 1', [reportPublicId]);
      const reportId = Number(reportRows[0]?.id);
      if (!Number.isSafeInteger(reportId) || reportId < 1) throw new Error('Conflict report was not persisted');
      for (const member of resolved) {
        await manager.query(
          `INSERT INTO mod_conflict_members (conflict_report_id,resource_id,resource_version_id,version_constraint,created_at)
           VALUES (?,?,?,?,NOW(6))`, [reportId, member.resource.id, member.version.id, member.version_constraint],
        );
      }
      await this.audit(manager, {
        actorId, action: 'resource.mod_conflict.submit', targetType: 'mod_conflict_report', targetId: reportId,
        eventType: null, result: 'unverified',
        details: { report_public_id: reportPublicId, member_resource_public_ids: resolved.map(item => item.resource.public_id), member_version_public_ids: resolved.map(item => item.version.public_id) },
      });
      for (const member of resolved) {
        await this.writeReviewEvent(manager, {
          resourceId: member.resource.id, versionId: member.version.id, actorId,
          eventType: 'mod_conflict_submit', result: 'unverified', reason: `Conflict report ${reportPublicId} submitted.`,
        });
      }
      return {
        public_id: reportPublicId,
        status: 'unverified',
        members: resolved.map(item => ({ resource_public_id: item.resource.public_id, version_public_id: item.version.public_id, version_constraint: item.version_constraint })),
      };
    });
  }

  async respondToModConflictReport(reportPublicId: string, actorUserId: number, input: ModConflictAuthorResponseInput) {
    const actorId = this.assertActor(actorUserId);
    this.assertUuid(reportPublicId, 'Report');
    const normalized = this.normalizeAuthorResponse(input);
    return this.dataSource.transaction(async (manager) => {
      const rows = await this.rows<ReportRow>(manager,
        `SELECT id,public_id FROM mod_conflict_reports WHERE public_id=? LIMIT 1 FOR UPDATE`, [reportPublicId]);
      const report = rows[0];
      if (!report) throw new NotFoundException('Mod 冲突报告不存在');
      const members = await this.rows<ReportRow>(manager,
        `SELECT resource.id AS resource_id,resource.public_id AS resource_public_id,resource.user_id,member.resource_version_id
         FROM mod_conflict_members member JOIN resources resource ON resource.id=member.resource_id
         WHERE member.conflict_report_id=? ORDER BY member.id ASC`, [report.id]);
      const authorized = await this.hasAuthorRole(manager, members, actorId);
      if (!authorized) throw new ForbiddenException({ code: 'RESOURCE_AUTHOR_REQUIRED', message: '只有相关 Mod 的所有者或维护者可以回复' });
      const fixedVersionId = await this.resolveFixedConflictVersion(manager, normalized, input);
      await manager.query(
        `UPDATE mod_conflict_reports SET author_response_status=?,author_response=?,fixed_resource_version_id=?,updated_at=NOW(6) WHERE id=?`,
        [normalized.status, normalized.response, fixedVersionId, report.id],
      );
      await this.audit(manager, {
        actorId, action: 'resource.mod_conflict.respond', targetType: 'mod_conflict_report', targetId: Number(report.id),
        eventType: null, result: normalized.status, details: { report_public_id: reportPublicId, fixed_resource_version_id: fixedVersionId },
      });
      for (const member of members) {
        await this.writeReviewEvent(manager, {
          resourceId: Number(member.resource_id), versionId: Number(member.resource_version_id), actorId,
          eventType: 'mod_conflict_response', result: normalized.status, reason: `Conflict report ${reportPublicId} received an author response.`,
        });
      }
      return { public_id: reportPublicId, author_response_status: normalized.status, fixed_resource_version_public_id: normalized.fixed_version_public_id };
    });
  }

  private async respondToResourceModReport(table: 'mod_compatibility_reports' | 'mod_issue_reports', kind: 'compatibility' | 'issue', reportPublicId: string, actorUserId: number, input: AuthorResponseInput) {
    const actorId = this.assertActor(actorUserId);
    this.assertUuid(reportPublicId, 'Report');
    const normalized = this.normalizeAuthorResponse(input);
    return this.dataSource.transaction(async (manager) => {
      const rows = await this.rows<ReportRow>(manager,
        `SELECT report.public_id,report.resource_id,report.resource_version_id,resource.public_id AS resource_public_id
         FROM ${table} report JOIN resources resource ON resource.id=report.resource_id
         WHERE report.public_id=? LIMIT 1 FOR UPDATE`, [reportPublicId]);
      const report = rows[0];
      if (!report) throw new NotFoundException(kind === 'issue' ? '问题报告不存在' : '兼容性报告不存在');
      await this.assertAuthorRole(manager, Number(report.resource_id), actorId);
      const fixedResource = normalized.status === 'fixed'
        ? await this.getPublicResource(manager, String(report.resource_public_id), 'mod') : null;
      const fixedVersionId = await this.resolveFixedVersionForResource(manager, normalized, fixedResource?.id ?? Number(report.resource_id));
      await manager.query(
        `UPDATE ${table} SET author_response_status=?,author_response=?,fixed_resource_version_id=?,updated_at=NOW(6) WHERE public_id=?`,
        [normalized.status, normalized.response, fixedVersionId, reportPublicId],
      );
      await this.audit(manager, {
        actorId, action: `resource.mod_${kind}.respond`, resourceId: Number(report.resource_id), versionId: Number(report.resource_version_id),
        eventType: kind === 'issue' ? 'mod_issue_response' : 'mod_compat_response', result: normalized.status,
        details: { report_public_id: reportPublicId, fixed_resource_version_id: fixedVersionId },
      });
      return { public_id: reportPublicId, resource_public_id: String(report.resource_public_id), author_response_status: normalized.status, fixed_resource_version_public_id: normalized.fixed_version_public_id };
    });
  }

  private async assertPhoneVerified(actorId: number): Promise<void> {
    const rows = await this.rows<ReportRow>(this.dataSource, 'SELECT phone_verified FROM users WHERE id = ? LIMIT 1', [actorId]);
    if (!rows[0] || Number(rows[0].phone_verified) !== 1) {
      throw new ForbiddenException({ code: 'PHONE_VERIFICATION_REQUIRED', message: 'Verify your phone number before submitting community reports.' });
    }
  }

  private async getPublicResource(executor: QueryExecutor, publicId: string, kind: 'map' | 'mod'): Promise<ResourceRow> {
    this.assertUuid(publicId, 'Resource');
    const rows = await this.rows<ResourceRow>(executor,
      `SELECT id,user_id,resource_kind,public_id FROM resources
       WHERE public_id=? AND is_public=1 AND deleted_at IS NULL AND status IN ('approved','published') LIMIT 1`, [publicId]);
    const resource = rows[0];
    if (!resource || resource.resource_kind !== kind) throw new NotFoundException('资源不存在或不可见');
    return resource;
  }

  private async getPublishedVersion(executor: QueryExecutor, resourceId: number, publicId: string): Promise<VersionRow> {
    this.assertUuid(publicId, 'Version');
    const rows = await this.rows<VersionRow>(executor,
      `SELECT id,resource_id,public_id,status FROM resource_versions
       WHERE resource_id=? AND public_id=? AND status='published' LIMIT 1`, [resourceId, publicId]);
    if (!rows[0]) throw new NotFoundException('已发布版本不存在或不可见');
    return rows[0];
  }

  private async aggregateMapFeedback(resourceId: number, versionId: number): Promise<Record<string, unknown>> {
    const rows = await this.rows<ReportRow>(this.dataSource,
      `SELECT COUNT(*) AS feedback_count,AVG(difficulty) AS difficulty_average,
        AVG(resource_sufficiency) AS resource_sufficiency_average,AVG(balance) AS balance_average,
        AVG(multiplayer_experience) AS multiplayer_experience_average
       FROM map_feedback WHERE resource_id=? AND resource_version_id=?`, [resourceId, versionId]);
    const row = rows[0] || {};
    return {
      feedback_count: this.number(row.feedback_count),
      difficulty_average: this.nullableNumber(row.difficulty_average),
      resource_sufficiency_average: this.nullableNumber(row.resource_sufficiency_average),
      balance_average: this.nullableNumber(row.balance_average),
      multiplayer_experience_average: this.nullableNumber(row.multiplayer_experience_average),
    };
  }

  private async assertAuthorRole(manager: EntityManager, resourceId: number, actorId: number): Promise<'owner' | 'maintainer'> {
    const rows = await this.rows<ReportRow>(manager,
      `SELECT resource.user_id,member.role,member.status FROM resources resource
       LEFT JOIN resource_members member ON member.resource_id=resource.id AND member.user_id=?
       WHERE resource.id=? LIMIT 1`, [actorId, resourceId]);
    const row = rows[0];
    if (row && Number(row.user_id) === actorId) return 'owner';
    if (row?.status === 'active' && ['owner', 'maintainer'].includes(String(row.role))) return row.role;
    throw new ForbiddenException({ code: 'RESOURCE_AUTHOR_REQUIRED', message: '只有资源所有者或维护者可以回复' });
  }

  private async hasAuthorRole(manager: EntityManager, members: ReportRow[], actorId: number): Promise<boolean> {
    for (const member of members) {
      try {
        await this.assertAuthorRole(manager, Number(member.resource_id), actorId);
        return true;
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
      }
    }
    return false;
  }

  private async resolveFixedVersionForResource(manager: EntityManager, response: ReturnType<ResourceV2CommunityWriteService['normalizeAuthorResponse']>, resourceId: number): Promise<number | null> {
    if (response.status !== 'fixed') {
      if (response.fixed_version_public_id) throw new BadRequestException('只有 fixed 回复可以关联修复版本');
      return null;
    }
    if (!response.fixed_version_public_id) throw new BadRequestException('fixed 回复必须关联一个已发布版本');
    return (await this.getPublishedVersion(manager, resourceId, response.fixed_version_public_id)).id;
  }

  private async resolveFixedConflictVersion(manager: EntityManager, response: ReturnType<ResourceV2CommunityWriteService['normalizeAuthorResponse']>, input: ModConflictAuthorResponseInput): Promise<number | null> {
    if (response.status !== 'fixed') {
      if (response.fixed_version_public_id || input.fixed_resource_public_id) throw new BadRequestException('只有 fixed 回复可以关联修复版本');
      return null;
    }
    if (!response.fixed_version_public_id || !input.fixed_resource_public_id) throw new BadRequestException('fixed 回复必须关联一个公开 Mod 资源的已发布版本');
    const resource = await this.getPublicResource(manager, input.fixed_resource_public_id, 'mod');
    return (await this.getPublishedVersion(manager, resource.id, response.fixed_version_public_id)).id;
  }

  private async audit(manager: EntityManager, input: {
    actorId: number; action: string; resourceId?: number; versionId?: number; targetType?: string; targetId?: number;
    eventType: string | null; result: string; details: Record<string, unknown>;
  }): Promise<void> {
    await manager.query(
      `INSERT INTO operation_logs (user_id,action,target_type,target_id,details,created_at)
       VALUES (?,?,?,?,?,NOW(6))`,
      [input.actorId, input.action, input.targetType ?? (input.resourceId ? 'resource' : null), input.targetId ?? input.resourceId ?? null, this.json(input.details)],
    );
    if (input.resourceId && input.eventType) await this.writeReviewEvent(manager, {
      resourceId: input.resourceId, versionId: input.versionId ?? null, actorId: input.actorId,
      eventType: input.eventType, result: input.result, reason: JSON.stringify(input.details),
    });
  }

  private async writeReviewEvent(manager: EntityManager, input: {
    resourceId: number; versionId: number | null; actorId: number; eventType: string; result: string; reason: string;
  }): Promise<void> {
    await manager.query(
      `INSERT INTO resource_review_events (resource_id,resource_version_id,actor_user_id,event_type,result,reason,created_at)
       VALUES (?,?,?,?,?,?,NOW(6))`,
      [input.resourceId, input.versionId, input.actorId, input.eventType.slice(0, 32), input.result.slice(0, 32), input.reason.slice(0, 60_000)],
    );
  }

  private normalizeFeedback(input: MapFeedbackInput): Required<MapFeedbackInput> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('反馈格式无效');
    const output: Required<MapFeedbackInput> = { difficulty: null, resource_sufficiency: null, balance: null, multiplayer_experience: null, body: this.optionalText(input.body, 5_000, '反馈内容') };
    let hasRating = false;
    for (const field of RATINGS) {
      const value = input[field];
      if (value === undefined || value === null) continue;
      if (!Number.isInteger(value) || value < 1 || value > 5) throw new BadRequestException(`${field} 必须是 1 到 5 的整数`);
      output[field] = value;
      hasRating = true;
    }
    if (!hasRating && !output.body) throw new BadRequestException('至少需要一项评分或反馈内容');
    return output;
  }

  private normalizeCompatibility(input: ModCompatibilityReportInput) {
    if (!input || !COMPATIBILITY_STATUSES.has(input.status)) throw new BadRequestException('兼容性状态无效');
    const runtime = input.runtime == null ? null : String(input.runtime).toLowerCase();
    if (runtime && !['java', 'js', 'hybrid', 'content'].includes(runtime)) throw new BadRequestException('运行时类型无效');
    return {
      public_id: '',
      status: input.status,
      game_version: this.optionalText(input.game_version, 80, '游戏版本'),
      platform_key: this.normalizeKey(input.platform_key, 50, '平台'),
      runtime,
      body: this.optionalText(input.body, 20_000, '兼容性报告'),
    };
  }

  private normalizeIssue(input: ModIssueReportInput) {
    if (!input || typeof input !== 'object') throw new BadRequestException('问题报告格式无效');
    const title = this.requiredText(input.title, 255, '标题');
    const body = this.requiredText(input.body, 20_000, '问题描述');
    return { title, body };
  }

  private normalizeConflict(input: ModConflictReportInput) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.members) || input.members.length < 2 || input.members.length > 10) {
      throw new BadRequestException('冲突报告必须包含 2 到 10 个 Mod 版本');
    }
    const members = input.members.map(member => {
      if (!member || typeof member !== 'object') throw new BadRequestException('冲突成员格式无效');
      this.assertUuid(member.resource_public_id, 'Resource');
      this.assertUuid(member.version_public_id, 'Version');
      return {
        resource_public_id: member.resource_public_id,
        version_public_id: member.version_public_id,
        version_constraint: this.optionalText(member.version_constraint, 255, '版本范围'),
      };
    });
    if (new Set(members.map(item => item.resource_public_id)).size !== members.length
      || new Set(members.map(item => item.version_public_id)).size !== members.length) {
      throw new BadRequestException('冲突报告成员不能重复');
    }
    const title = this.optionalText(input.title, 255, '标题');
    const body = this.optionalText(input.body, 20_000, '冲突描述');
    if (!title && !body) throw new BadRequestException('冲突报告至少需要标题或描述');
    return {
      title,
      body,
      game_version_min: this.optionalText(input.game_version_min, 80, '最低游戏版本'),
      game_version_max: this.optionalText(input.game_version_max, 80, '最高游戏版本'),
      members,
    };
  }

  private normalizeAuthorResponse(input: AuthorResponseInput) {
    if (!input || !AUTHOR_RESPONSE_STATUSES.has(input.author_response_status)) throw new BadRequestException('作者回复状态无效');
    const versionPublicId = input.fixed_resource_version_public_id?.trim() || null;
    if (versionPublicId) this.assertUuid(versionPublicId, 'Version');
    return {
      status: input.author_response_status,
      response: this.optionalText(input.author_response, 10_000, '作者回复'),
      fixed_version_public_id: versionPublicId,
    };
  }

  private optionalText(value: unknown, max: number, label: string): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') throw new BadRequestException(`${label}格式无效`);
    const text = value.trim();
    if (text.length > max) throw new BadRequestException(`${label}不能超过 ${max} 个字符`);
    return text || null;
  }

  private requiredText(value: unknown, max: number, label: string): string {
    const text = this.optionalText(value, max, label);
    if (!text) throw new BadRequestException(`${label}不能为空`);
    return text;
  }

  private normalizeKey(value: unknown, max: number, label: string): string | null {
    const text = this.optionalText(value, max, label);
    if (text && !/^[A-Za-z0-9_.:-]+$/.test(text)) throw new BadRequestException(`${label}格式无效`);
    return text;
  }

  private assertActor(value: number): number {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw new UnauthorizedException('需要登录账号');
    return id;
  }

  private assertUuid(value: unknown, label: string): asserts value is string {
    if (typeof value !== 'string' || !UUID_RE.test(value)) throw new BadRequestException(`${label}公开标识必须是 UUID`);
  }

  private isUuid(value: unknown): value is string { return typeof value === 'string' && UUID_RE.test(value); }

  private async rows<T extends ReportRow>(executor: QueryExecutor, sql: string, params: unknown[] = []): Promise<T[]> {
    const rows = await executor.query(sql, params) as T[] | [T[], unknown];
    if (!Array.isArray(rows)) return [];
    return Array.isArray(rows[0]) ? rows[0] as T[] : rows as T[];
  }

  private json(value: unknown): string { return JSON.stringify(value); }
  private number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  private nullableNumber(value: unknown): number | null { if (value == null || value === '') return null; const parsed = Number(value); return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null; }
}

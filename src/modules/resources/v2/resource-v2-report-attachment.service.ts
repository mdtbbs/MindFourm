import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { attachmentContentDisposition } from '@common/utils/content-disposition.util';
import { assertSafeUploadedFile } from '@common/utils/upload-safety.util';
import { ResourceStorageService } from '../resource-storage.service';

export type ModReportType = 'issue' | 'compatibility';

export const MAX_MOD_REPORT_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_MOD_REPORT_ATTACHMENTS_PER_REPORT = 10;
export const MAX_MOD_REPORT_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
const LOG_EXTENSIONS = new Set(['.log', '.txt', '.json', '.crash']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReportRow = {
  report_id: number;
  report_public_id: string;
  reporter_user_id: number;
  resource_id: number;
  resource_public_id: string;
  resource_owner_user_id: number;
  actor_role: string | null;
  member_role: string | null;
  member_status: string | null;
};

type AttachmentRow = {
  public_id: string;
  kind: 'log' | 'image';
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number | string;
  sha256: string;
  created_at: Date | string;
};

/** Stores report evidence privately and authorizes each metadata and binary read. */
@Injectable()
export class ResourceV2ReportAttachmentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: ResourceStorageService,
  ) {}

  async list(type: ModReportType, reportPublicId: string, actorUserId: number) {
    const report = await this.requireReadableReport(type, reportPublicId, actorUserId);
    const foreignKey = this.attachmentForeignKey(type);
    const rows = await this.dataSource.query(
      `SELECT public_id,kind,file_name,mime_type,file_size,sha256,created_at
       FROM mod_report_attachments WHERE ${foreignKey}=? ORDER BY created_at ASC,id ASC`,
      [report.report_id],
    ) as AttachmentRow[];
    return {
      items: rows.filter(row => this.isUuid(row.public_id)).map(row => this.toPublicDto(
        type, report.report_public_id, row, Number(report.reporter_user_id) === actorUserId,
      )),
      max_attachments: MAX_MOD_REPORT_ATTACHMENTS_PER_REPORT,
      max_file_size_bytes: MAX_MOD_REPORT_ATTACHMENT_BYTES,
      max_total_size_bytes: MAX_MOD_REPORT_ATTACHMENT_TOTAL_BYTES,
    };
  }

  async add(type: ModReportType, reportPublicId: string, actorUserId: number, file: Express.Multer.File | undefined) {
    const actorId = this.assertActor(actorUserId);
    const report = await this.requireWritableReport(type, reportPublicId, actorId);
    await this.assertPhoneVerified(actorId);
    const detected = await this.validateIncomingFile(file);
    if (!file) throw new BadRequestException('请选择一个日志或图片附件');

    const current = await this.attachmentUsage(type, report.report_id);
    this.assertRoom(current.count, current.totalBytes, detected.size);

    const stored = await this.storage.storeIncoming(file);
    if (!stored) throw new BadRequestException('附件未能进入隔离存储');

    try {
      const publicId = randomUUID();
      const now = new Date();
      const foreignKey = this.attachmentForeignKey(type);
      const inserted = await this.dataSource.transaction(async (manager) => {
        const lockedReport = await this.rows<ReportRow>(manager,
          `SELECT report.id AS report_id,report.public_id AS report_public_id,report.user_id AS reporter_user_id,
            report.resource_id,resource.public_id AS resource_public_id,resource.user_id AS resource_owner_user_id,
            actor.role AS actor_role,member.role AS member_role,member.status AS member_status
           FROM ${this.reportTable(type)} report
           JOIN resources resource ON resource.id=report.resource_id AND resource.resource_kind='mod'
           LEFT JOIN users actor ON actor.id=?
           LEFT JOIN resource_members member ON member.resource_id=resource.id AND member.user_id=?
           WHERE report.id=? AND report.public_id=? LIMIT 1 FOR UPDATE`,
          [actorId, actorId, report.report_id, report.report_public_id]);
        if (!lockedReport[0] || Number(lockedReport[0].reporter_user_id) !== actorId) {
          throw new NotFoundException('问题报告不存在或不可修改');
        }
        const lockedUsage = await this.attachmentUsage(type, report.report_id, manager);
        this.assertRoom(lockedUsage.count, lockedUsage.totalBytes, detected.size);
        await manager.query(
          `INSERT INTO mod_report_attachments
            (public_id,${foreignKey},kind,file_name,file_path,mime_type,file_size,sha256,uploaded_by_user_id,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [publicId, report.report_id, detected.kind, detected.name, stored.file_path, detected.mimeType,
            detected.size, stored.content_hash, actorId, now],
        );
        return { public_id: publicId, kind: detected.kind, file_name: detected.name, mime_type: detected.mimeType,
          file_size: detected.size, sha256: stored.content_hash, created_at: now } as AttachmentRow;
      });
      return this.toPublicDto(type, report.report_public_id, inserted, true);
    } catch (error) {
      await this.storage.removeQuarantinedFile(stored.file_path).catch(() => undefined);
      throw error;
    }
  }

  async read(type: ModReportType, reportPublicId: string, attachmentPublicId: string, actorUserId: number) {
    const report = await this.requireReadableReport(type, reportPublicId, actorUserId);
    this.assertUuid(attachmentPublicId, 'Attachment');
    const foreignKey = this.attachmentForeignKey(type);
    const rows = await this.dataSource.query(
      `SELECT public_id,kind,file_name,file_path,mime_type,file_size,sha256,created_at
       FROM mod_report_attachments WHERE ${foreignKey}=? AND public_id=? LIMIT 1`,
      [report.report_id, attachmentPublicId],
    ) as AttachmentRow[];
    const attachment = rows[0];
    if (!attachment || !this.isUuid(attachment.public_id)) throw new NotFoundException('附件不存在或不可见');
    const size = Number(attachment.file_size);
    let buffer: Buffer;
    try {
      buffer = await this.storage.readQuarantinedFile(attachment.file_path, MAX_MOD_REPORT_ATTACHMENT_BYTES);
    } catch {
      throw new NotFoundException('附件不可用');
    }
    if (buffer.length !== size || createHash('sha256').update(buffer).digest('hex') !== attachment.sha256) {
      throw new NotFoundException('附件不可用');
    }
    const mimeType = this.safeMimeType(attachment.kind, attachment.mime_type);
    return {
      buffer,
      mime_type: mimeType,
      size_bytes: size,
      file_name: this.safeFileName(attachment.file_name),
      content_disposition: attachmentContentDisposition(this.safeFileName(attachment.file_name)),
    };
  }

  async remove(type: ModReportType, reportPublicId: string, attachmentPublicId: string, actorUserId: number) {
    const actorId = this.assertActor(actorUserId);
    const report = await this.requireWritableReport(type, reportPublicId, actorId);
    this.assertUuid(attachmentPublicId, 'Attachment');
    const foreignKey = this.attachmentForeignKey(type);
    const attachment = await this.dataSource.transaction(async (manager) => {
      const rows = await this.rows<AttachmentRow>(manager,
        `SELECT public_id,kind,file_name,file_path,mime_type,file_size,sha256,created_at
         FROM mod_report_attachments WHERE ${foreignKey}=? AND public_id=? LIMIT 1 FOR UPDATE`,
        [report.report_id, attachmentPublicId]);
      const row = rows[0];
      if (!row) throw new NotFoundException('附件不存在或不可修改');
      await manager.query(`DELETE FROM mod_report_attachments WHERE ${foreignKey}=? AND public_id=?`, [report.report_id, attachmentPublicId]);
      return row;
    });
    await this.storage.removeQuarantinedFile(attachment.file_path).catch(() => false);
    return { public_id: attachmentPublicId, deleted: true };
  }

  private async validateIncomingFile(file: Express.Multer.File | undefined): Promise<{
    kind: 'log' | 'image'; name: string; mimeType: string; size: number;
  }> {
    if (!file?.path || !file.originalname) throw new BadRequestException('请选择一个日志或图片附件');
    const name = this.safeFileName(file.originalname);
    const extension = path.extname(name).toLowerCase();
    let kind: 'log' | 'image';
    let mimeType: string;
    if (IMAGE_MIME_BY_EXTENSION[extension]) {
      kind = 'image';
      mimeType = IMAGE_MIME_BY_EXTENSION[extension];
      await assertSafeUploadedFile(file, MAX_MOD_REPORT_ATTACHMENT_BYTES);
    } else if (LOG_EXTENSIONS.has(extension)) {
      kind = 'log';
      mimeType = 'text/plain';
      const stat = await fs.stat(file.path);
      if (!stat.isFile() || stat.size < 1 || stat.size > MAX_MOD_REPORT_ATTACHMENT_BYTES
        || file.size !== stat.size || file.size > MAX_MOD_REPORT_ATTACHMENT_BYTES) {
        throw new BadRequestException('附件大小必须为 1–5 MiB');
      }
      const bytes = await fs.readFile(file.path);
      if (bytes.includes(0)) throw new BadRequestException('日志文件不能包含二进制内容');
      try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new BadRequestException('日志文件必须使用 UTF-8 文本编码'); }
    } else {
      throw new BadRequestException('只允许 PNG/JPEG/GIF/WebP 图片或 TXT/LOG/JSON/CRASH 日志');
    }
    const stat = await fs.stat(file.path);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_MOD_REPORT_ATTACHMENT_BYTES || file.size !== stat.size) {
      throw new BadRequestException('附件大小必须为 1–5 MiB');
    }
    return { kind, name, mimeType, size: stat.size };
  }

  private async requireReadableReport(type: ModReportType, publicId: string, actorUserId: number): Promise<ReportRow> {
    const actorId = this.assertActor(actorUserId);
    const report = await this.findReport(type, publicId, actorId);
    if (!report || !this.canReadReport(report, actorId)) throw new NotFoundException('报告不存在或附件不可见');
    return report;
  }

  private async requireWritableReport(type: ModReportType, publicId: string, actorId: number): Promise<ReportRow> {
    this.assertUuid(publicId, 'Report');
    const report = await this.findReport(type, publicId, actorId);
    if (!report || Number(report.reporter_user_id) !== actorId) {
      throw new NotFoundException('报告不存在或不可修改');
    }
    return report;
  }

  private async findReport(type: ModReportType, publicId: string, actorId: number): Promise<ReportRow | null> {
    this.assertUuid(publicId, 'Report');
    const rows = await this.dataSource.query(
      `SELECT report.id AS report_id,report.public_id AS report_public_id,report.user_id AS reporter_user_id,
        report.resource_id,resource.public_id AS resource_public_id,resource.user_id AS resource_owner_user_id,
        actor.role AS actor_role,member.role AS member_role,member.status AS member_status
       FROM ${this.reportTable(type)} report
       JOIN resources resource ON resource.id=report.resource_id AND resource.resource_kind='mod'
       LEFT JOIN users actor ON actor.id=?
       LEFT JOIN resource_members member ON member.resource_id=resource.id AND member.user_id=?
       WHERE report.public_id=? LIMIT 1`,
      [actorId, actorId, publicId],
    ) as ReportRow[];
    return rows[0] || null;
  }

  private canReadReport(report: ReportRow, actorId: number): boolean {
    if (Number(report.reporter_user_id) === actorId || Number(report.resource_owner_user_id) === actorId) return true;
    if (['admin', 'moderator'].includes(String(report.actor_role || ''))) return true;
    return report.member_status === 'active' && ['owner', 'maintainer', 'publisher'].includes(String(report.member_role || ''));
  }

  private async assertPhoneVerified(actorId: number): Promise<void> {
    const rows = await this.dataSource.query('SELECT phone_verified FROM users WHERE id=? LIMIT 1', [actorId]) as Array<{ phone_verified: number }>;
    if (!rows[0] || Number(rows[0].phone_verified) !== 1) {
      throw new ForbiddenException({ code: 'PHONE_VERIFICATION_REQUIRED', message: 'Verify your phone number before uploading report evidence.' });
    }
  }

  private async attachmentUsage(type: ModReportType, reportId: number, executor: DataSource | EntityManager = this.dataSource) {
    const foreignKey = this.attachmentForeignKey(type);
    const rows = await executor.query(
      `SELECT COUNT(*) AS attachment_count,COALESCE(SUM(file_size),0) AS total_bytes
       FROM mod_report_attachments WHERE ${foreignKey}=?`, [reportId],
    ) as Array<{ attachment_count: number | string; total_bytes: number | string }>;
    return { count: Number(rows[0]?.attachment_count || 0), totalBytes: Number(rows[0]?.total_bytes || 0) };
  }

  private assertRoom(count: number, totalBytes: number, incomingBytes: number): void {
    if (count >= MAX_MOD_REPORT_ATTACHMENTS_PER_REPORT) throw new BadRequestException('每份报告最多可附加 10 个文件');
    if (totalBytes + incomingBytes > MAX_MOD_REPORT_ATTACHMENT_TOTAL_BYTES) throw new BadRequestException('每份报告的附件总大小不能超过 20 MiB');
  }

  private toPublicDto(type: ModReportType, reportPublicId: string, row: AttachmentRow, canDelete: boolean) {
    const reportPath = type === 'issue' ? 'issue-reports' : 'compatibility-reports';
    return {
      public_id: row.public_id,
      kind: row.kind,
      name: this.safeFileName(row.file_name),
      size_bytes: Number(row.file_size),
      mime_type: this.safeMimeType(row.kind, row.mime_type),
      sha256: row.sha256,
      created_at: this.isoDate(row.created_at),
      download_url: `/api/v1/resources/mods/${reportPath}/${reportPublicId}/attachments/${row.public_id}`,
      can_delete: canDelete,
    };
  }

  private safeMimeType(kind: string, mimeType: string): string {
    if (kind === 'log' && mimeType === 'text/plain') return 'text/plain';
    if (kind === 'image' && Object.values(IMAGE_MIME_BY_EXTENSION).includes(mimeType)) return mimeType;
    throw new NotFoundException('附件类型无效');
  }

  private safeFileName(value: string): string {
    if (typeof value !== 'string') throw new BadRequestException('附件名称无效');
    const name = value.replace(/\\/g, '/').split('/').pop()!
      .replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!name || name.length > 255 || name === '.' || name === '..') throw new BadRequestException('附件名称无效');
    return name;
  }

  private isoDate(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
  }

  private assertActor(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1) throw new ForbiddenException('需要登录');
    return value;
  }

  private assertUuid(value: string, label: string): void {
    if (!this.isUuid(value)) throw new BadRequestException(`${label} public UUID 无效`);
  }

  private isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_RE.test(value);
  }

  private reportTable(type: ModReportType): string {
    return type === 'issue' ? 'mod_issue_reports' : 'mod_compatibility_reports';
  }

  private attachmentForeignKey(type: ModReportType): string {
    return type === 'issue' ? 'issue_report_id' : 'compatibility_report_id';
  }

  private async rows<T>(executor: Pick<DataSource, 'query'> | Pick<EntityManager, 'query'>, sql: string, parameters: unknown[]): Promise<T[]> {
    return await executor.query(sql, parameters) as T[];
  }
}

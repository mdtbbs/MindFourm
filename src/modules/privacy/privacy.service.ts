import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { LegalAcceptance, OperationLog, SessionAudit, ExternalApiAuditLog, UserDataDeletionRequest } from '@entities/index';
import { LogsService } from '../logs/logs.service';

const OPEN_STATUSES = ['pending', 'in_review'];
const REVIEW_STATUSES = ['in_review', 'completed', 'rejected'];

@Injectable()
export class PrivacyService {
  constructor(
    @InjectRepository(UserDataDeletionRequest) private readonly requests: Repository<UserDataDeletionRequest>,
    private readonly dataSource: DataSource,
    private readonly logs: LogsService,
  ) {}

  async createRequest(userId: number, reason: string | undefined, context: { ip?: string; userAgent?: string }) {
    const existing = await this.requests.findOne({ where: { user_id: userId, status: In(OPEN_STATUSES) } });
    if (existing) throw new BadRequestException('已有正在处理的数据删除申请');
    const request = await this.requests.save(this.requests.create({
      user_id: userId,
      request_reason: this.cleanText(reason, 2000),
      status: 'pending',
    }));
    await this.logs.log({ user_id: userId, action: 'privacy.deletion_request.create', target_type: 'deletion_request', target_id: request.id, ip_address: context.ip, user_agent: context.userAgent });
    return request;
  }

  async getOwnRequests(userId: number) {
    return this.requests.find({ where: { user_id: userId }, order: { created_at: 'DESC' } });
  }

  async getAdminRequests(status?: string) {
    return this.requests.find({
      where: status ? { status: status as UserDataDeletionRequest['status'] } : {},
      relations: ['user'],
      select: { id: true, user_id: true, status: true, request_reason: true, resolution: true, reviewed_by: true, reviewed_at: true, legal_hold_until: true, created_at: true, updated_at: true, user: { id: true, username: true, email: true } },
      order: { created_at: 'ASC' },
      take: 200,
    });
  }

  async reviewRequest(
    id: number,
    reviewerId: number,
    input: { status: string; resolution?: string; legal_hold_until?: string | null },
    context: { ip?: string; userAgent?: string },
  ) {
    if (!REVIEW_STATUSES.includes(input.status)) throw new BadRequestException('无效的处理状态');
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException('数据删除申请不存在');
    const hold = input.legal_hold_until ? new Date(input.legal_hold_until) : null;
    if (hold && Number.isNaN(hold.getTime())) throw new BadRequestException('法律留存截止时间无效');
    request.status = input.status as UserDataDeletionRequest['status'];
    request.resolution = this.cleanText(input.resolution, 4000);
    request.legal_hold_until = hold;
    request.reviewed_by = reviewerId;
    request.reviewed_at = new Date();
    const saved = await this.requests.save(request);
    await this.logs.log({
      user_id: reviewerId,
      action: 'privacy.deletion_request.review',
      target_type: 'deletion_request',
      target_id: saved.id,
      details: JSON.stringify({ status: saved.status, legal_hold_until: saved.legal_hold_until?.toISOString() || null }),
      ip_address: context.ip,
      user_agent: context.userAgent,
    });
    return saved;
  }

  /** Deletes only audit data older than one year and honors an active legal hold. */
  async cleanupExpiredAuditData(now = new Date()): Promise<Record<string, number>> {
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
    const tables: Array<[string, string]> = [
      ['operation_logs', 'user_id'],
      ['session_audit', 'user_id'],
      ['external_api_audit_logs', 'actor_user_id'],
      ['legal_acceptances', 'user_id'],
    ];
    const result: Record<string, number> = {};
    for (const [table, userColumn] of tables) {
      const response = await this.dataSource.query(
        `DELETE FROM ${table}
          WHERE created_at < ?
            AND (${userColumn} IS NULL OR NOT EXISTS (
              SELECT 1 FROM user_data_deletion_requests hold_request
               WHERE hold_request.user_id = ${table}.${userColumn}
                 AND hold_request.legal_hold_until IS NOT NULL
                 AND hold_request.legal_hold_until > UTC_TIMESTAMP()
            ))`,
        [cutoff],
      );
      result[table] = Number(response?.affectedRows || 0);
    }
    return result;
  }

  private cleanText(value: string | undefined, limit: number): string | null {
    const normalized = String(value || '').trim().slice(0, limit);
    return normalized || null;
  }
}

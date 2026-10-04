import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { SecurityAccessLog } from '@entities/security-access-log.entity';
import { LogsService } from '../logs/logs.service';
import { getClientIp } from '@common/utils/client-context.util';
import { SettingsService } from '../settings/settings.service';

const DEFAULT_RETENTION_DAYS = 90;
const MAX_RETENTION_DAYS = 365;

export interface SecurityAccessLogInput {
  request_id: string;
  user_id?: number | null;
  method: string;
  route: string;
  resource_type?: string | null;
  resource_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  status_code: number;
}

export interface SecurityAccessLogFilters {
  request_id?: string;
  user_id?: number;
  ip_address?: string;
  route?: string;
  resource_id?: string;
  status_code?: number;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class SecurityAccessLogsService {
  constructor(
    @InjectRepository(SecurityAccessLog) private readonly repository: Repository<SecurityAccessLog>,
    private readonly operationLogs: LogsService,
    private readonly settings: SettingsService,
  ) {}

  record(input: SecurityAccessLogInput): Promise<SecurityAccessLog> {
    return this.repository.save(this.repository.create({
      ...input,
      user_id: input.user_id ?? null,
      resource_type: input.resource_type ?? null,
      resource_id: input.resource_id ?? null,
      ip_address: input.ip_address ?? null,
      user_agent: input.user_agent?.slice(0, 512) ?? null,
    }));
  }

  async search(filters: SecurityAccessLogFilters, actor: any, request: any) {
    const page = Math.max(1, Math.floor(filters.page || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(filters.limit || 50)));
    const query = this.repository.createQueryBuilder('entry');
    if (filters.request_id) query.andWhere('entry.request_id = :requestId', { requestId: filters.request_id });
    if (filters.user_id != null) query.andWhere('entry.user_id = :userId', { userId: filters.user_id });
    if (filters.ip_address) query.andWhere('entry.ip_address = :ipAddress', { ipAddress: filters.ip_address });
    if (filters.route) query.andWhere('entry.route LIKE :route', { route: `%${filters.route}%` });
    if (filters.resource_id) query.andWhere('entry.resource_id = :resourceId', { resourceId: filters.resource_id });
    if (filters.status_code != null) query.andWhere('entry.status_code = :statusCode', { statusCode: filters.status_code });
    if (filters.from) query.andWhere('entry.created_at >= :from', { from: this.dateBound(filters.from, false) });
    if (filters.to) query.andWhere('entry.created_at <= :to', { to: this.dateBound(filters.to, true) });

    const filterKeys = Object.keys(filters).filter((key) => !['page', 'limit'].includes(key));
    await this.operationLogs.log({
      user_id: actor.id,
      action: filterKeys.length ? 'security_access_logs.search' : 'security_access_logs.view',
      target_type: 'security_access_logs',
      details: JSON.stringify({ filter_fields: filterKeys, page, limit }),
      ip_address: getClientIp(request),
      user_agent: request.headers?.['user-agent']?.slice(0, 512),
    });

    const [data, total] = await query.orderBy('entry.created_at', 'DESC').addOrderBy('entry.id', 'DESC')
      .skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  @Cron('0 0 3 * * *')
  async purgeExpired(): Promise<void> {
    const retentionDays = await this.getRetentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    await this.repository.delete({ created_at: LessThan(cutoff) });
  }

  private async getRetentionDays(): Promise<number> {
    const configured = await this.settings.getNumber('security_access_log_retention_days');
    if (typeof configured !== 'number' || !Number.isFinite(configured) || configured < 1) {
      return DEFAULT_RETENTION_DAYS;
    }
    return Math.min(Math.floor(configured), MAX_RETENTION_DAYS);
  }

  private dateBound(value: string, endOfDay: boolean): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
    }
    return new Date(value);
  }
}

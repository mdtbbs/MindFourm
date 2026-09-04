import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalApiAuditLog } from '@entities/external-api-audit-log.entity';
import { LogsService } from '../logs/logs.service';

export interface ExternalApiAuditInput {
  api_key_id?: number | null;
  api_key_name?: string | null;
  action: string;
  scope?: string | null;
  actor_user_id?: number | null;
  target_type?: string | null;
  target_id?: number | null;
  request_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  details?: Record<string, unknown> | null;
  status?: 'success' | 'failed';
  error_message?: string | null;
}

@Injectable()
export class ExternalApiAuditService {
  constructor(
    @InjectRepository(ExternalApiAuditLog)
    private externalApiAuditLogRepository: Repository<ExternalApiAuditLog>,
    private logsService: LogsService,
  ) {}

  async record(input: ExternalApiAuditInput): Promise<ExternalApiAuditLog> {
    const log = this.externalApiAuditLogRepository.create({
      api_key_id: input.api_key_id ?? null,
      api_key_name: input.api_key_name ?? null,
      action: input.action,
      scope: input.scope ?? null,
      actor_user_id: input.actor_user_id ?? null,
      target_type: input.target_type ?? null,
      target_id: input.target_id ?? null,
      request_id: input.request_id ?? null,
      ip_address: input.ip_address ?? null,
      user_agent: input.user_agent ?? null,
      details_json: input.details ? JSON.stringify(input.details) : null,
      status: input.status ?? 'success',
      error_message: input.error_message ?? null,
    });

    return this.externalApiAuditLogRepository.save(log);
  }

  async recordOperation(input: ExternalApiAuditInput): Promise<void> {
    await Promise.all([
      this.record(input),
      this.logsService.log({
        user_id: input.actor_user_id ?? undefined,
        action: `external.${input.action}`,
        target_type: input.target_type ?? undefined,
        target_id: input.target_id ?? undefined,
        details: JSON.stringify({
          ...(input.details ?? {}),
          external_actor: true,
          api_key_id: input.api_key_id ?? null,
          api_key_name: input.api_key_name ?? null,
          request_id: input.request_id ?? null,
          scope: input.scope ?? null,
          status: input.status ?? 'success',
        }),
        ip_address: input.ip_address ?? undefined,
        user_agent: input.user_agent ?? undefined,
      }),
    ]).then(() => undefined);
  }

  async list(params: {
    page?: number;
    limit?: number;
    api_key_id?: number;
    actor_user_id?: number;
    action?: string;
    status?: string;
  } = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const where: Record<string, unknown> = {};
    if (params.api_key_id !== undefined) where.api_key_id = params.api_key_id;
    if (params.actor_user_id !== undefined) where.actor_user_id = params.actor_user_id;
    if (params.action) where.action = params.action;
    if (params.status) where.status = params.status;

    const [items, total] = await this.externalApiAuditLogRepository.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((item) => ({
        ...item,
        details: this.parseDetails(item.details_json),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private parseDetails(value: string | null): Record<string, unknown> | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}

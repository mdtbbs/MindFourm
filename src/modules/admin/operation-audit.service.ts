import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationLog } from '@entities/operation-log.entity';

export type OperationAuditQuery = {
  page?: number;
  limit?: number;
  user_id?: number;
  target_id?: number;
  action?: string;
  action_prefix?: string;
  target_type?: string;
  request_id?: string;
  q?: string;
  since?: Date;
  until?: Date;
};

@Injectable()
export class OperationAuditService {
  constructor(@InjectRepository(OperationLog) private readonly logs: Repository<OperationLog>) {}

  async list(input: OperationAuditQuery) {
    const page = this.number(input.page, 1, 1, 1_000_000);
    const limit = this.number(input.limit, 50, 1, 100);
    const qb = this.logs.createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .select([
        'log.id', 'log.user_id', 'log.action', 'log.target_type', 'log.target_id', 'log.details',
        'log.ip_address', 'log.user_agent', 'log.created_at', 'user.id', 'user.username', 'user.email',
      ]);

    if (input.user_id) qb.andWhere('log.user_id = :userId', { userId: input.user_id });
    if (input.target_id) qb.andWhere('log.target_id = :targetId', { targetId: input.target_id });
    if (input.action?.trim()) qb.andWhere('log.action = :action', { action: input.action.trim() });
    if (input.action_prefix?.trim()) qb.andWhere('log.action LIKE :actionPrefix', { actionPrefix: `${this.escapeLike(input.action_prefix.trim())}%` });
    if (input.target_type?.trim()) qb.andWhere('log.target_type = :targetType', { targetType: input.target_type.trim() });
    if (input.since) qb.andWhere('log.created_at >= :since', { since: input.since });
    if (input.until) qb.andWhere('log.created_at <= :until', { until: input.until });
    if (input.request_id?.trim()) {
      qb.andWhere("CASE WHEN JSON_VALID(log.details) THEN JSON_UNQUOTE(JSON_EXTRACT(log.details, '$.request_id')) ELSE NULL END = :requestId", {
        requestId: input.request_id.trim(),
      });
    }
    if (input.q?.trim()) {
      const q = `%${this.escapeLike(input.q.trim().slice(0, 100))}%`;
      qb.andWhere('(log.action LIKE :q OR log.target_type LIKE :q OR log.details LIKE :q OR user.username LIKE :q)', { q });
    }

    const [data, total] = await qb.orderBy('log.created_at', 'DESC').addOrderBy('log.id', 'DESC')
      .skip((page - 1) * limit).take(limit).getManyAndCount();

    return {
      data: data.map((log) => this.serialize(log)),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async detail(id: number) {
    const log = await this.logs.createQueryBuilder('log').leftJoinAndSelect('log.user', 'user').where('log.id = :id', { id }).getOne();
    if (!log) throw new NotFoundException('Audit record not found');
    return this.serialize(log, true);
  }

  async summary(requestedDays = 7) {
    const days = [1, 7, 30, 90].includes(Number(requestedDays)) ? Number(requestedDays) : 7;
    const since = new Date(Date.now() - days * 86_400_000);
    const [actions, targets, actors, total] = await Promise.all([
      this.logs.createQueryBuilder('log').select('log.action', 'name').addSelect('COUNT(*)', 'count')
        .where('log.created_at >= :since', { since }).groupBy('log.action').orderBy('count', 'DESC').limit(20).getRawMany(),
      this.logs.createQueryBuilder('log').select("COALESCE(log.target_type, 'unknown')", 'name').addSelect('COUNT(*)', 'count')
        .where('log.created_at >= :since', { since }).groupBy("COALESCE(log.target_type, 'unknown')").orderBy('count', 'DESC').limit(20).getRawMany(),
      this.logs.createQueryBuilder('log').leftJoin('log.user', 'user').select('log.user_id', 'user_id')
        .addSelect("COALESCE(user.username, 'system')", 'username').addSelect('COUNT(*)', 'count')
        .where('log.created_at >= :since', { since }).groupBy('log.user_id').addGroupBy('user.username').orderBy('count', 'DESC').limit(20).getRawMany(),
      this.logs.createQueryBuilder('log').where('log.created_at >= :since', { since }).getCount(),
    ]);
    return {
      range_days: days,
      total,
      top_actions: actions.map((row: any) => ({ name: String(row.name), count: Number(row.count) || 0 })),
      top_targets: targets.map((row: any) => ({ name: String(row.name), count: Number(row.count) || 0 })),
      top_actors: actors.map((row: any) => ({ user_id: row.user_id == null ? null : Number(row.user_id), username: String(row.username), count: Number(row.count) || 0 })),
    };
  }

  private serialize(log: OperationLog, includeParsedDetails = false) {
    let parsed: unknown = null;
    if (includeParsedDetails && log.details) {
      try { parsed = JSON.parse(log.details); } catch { parsed = log.details; }
    }
    return {
      id: log.id,
      user_id: log.user_id ?? null,
      user: log.user ? { id: log.user.id, username: log.user.username, email: log.user.email } : null,
      action: log.action,
      target_type: log.target_type ?? null,
      target_id: log.target_id ?? null,
      details: log.details ?? null,
      ...(includeParsedDetails ? { parsed_details: parsed } : {}),
      ip_address: log.ip_address ?? null,
      user_agent: log.user_agent ?? null,
      created_at: log.created_at,
    };
  }

  private number(value: unknown, fallback: number, min: number, max: number) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
  }

  private escapeLike(value: string) {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`);
  }
}

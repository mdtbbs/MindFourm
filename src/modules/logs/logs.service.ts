import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationLog } from '@entities/operation-log.entity';
import { User } from '@entities/user.entity';

@Injectable()
export class LogsService {
  constructor(
    @InjectRepository(OperationLog)
    private operationLogRepository: Repository<OperationLog>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Log an operation
   */
  async log(data: {
    user_id?: number;
    action: string;
    target_type?: string;
    target_id?: number;
    details?: string;
    ip_address?: string;
    user_agent?: string;
  }, manager?: EntityManager): Promise<OperationLog> {
    const repository = manager?.getRepository(OperationLog) || this.operationLogRepository;
    const log = repository.create({
      user_id: data.user_id,
      action: data.action,
      target_type: data.target_type,
      target_id: data.target_id,
      details: data.details,
      ip_address: data.ip_address,
      user_agent: data.user_agent,
    });

    return repository.save(log);
  }

  async getLogById(id: number): Promise<OperationLog | null> {
    return this.operationLogRepository.findOne({ where: { id } });
  }

  /**
   * Get paginated logs with user info
   */
  async getLogs(params: {
    page: number;
    limit: number;
    user_id?: number;
    action?: string;
    target_type?: string;
    request_id?: string;
  }): Promise<{
    data: OperationLog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page, limit, user_id, action, target_type, request_id } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (user_id) where.user_id = user_id;
    if (action) where.action = action;
    if (target_type) where.target_type = target_type;

    if (request_id) {
      const query = this.operationLogRepository
        .createQueryBuilder('log')
        .leftJoin('log.user', 'user')
        .select([
          'log.id',
          'log.user_id',
          'log.action',
          'log.target_type',
          'log.target_id',
          'log.details',
          'log.ip_address',
          'log.user_agent',
          'log.created_at',
          'user.id',
          'user.username',
          'user.email',
        ])
        .where(
          "CASE WHEN JSON_VALID(log.details) THEN JSON_UNQUOTE(JSON_EXTRACT(log.details, '$.request_id')) ELSE NULL END = :requestId",
          { requestId: request_id },
        );

      if (user_id) query.andWhere('log.user_id = :userId', { userId: user_id });
      if (action) query.andWhere('log.action = :action', { action });
      if (target_type) query.andWhere('log.target_type = :targetType', { targetType: target_type });

      const [data, total] = await query
        .orderBy('log.created_at', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    const [data, total] = await this.operationLogRepository.findAndCount({
      where,
      relations: ['user'],
      select: {
        id: true,
        user_id: true,
        action: true,
        target_type: true,
        target_id: true,
        details: true,
        ip_address: true,
        user_agent: true,
        created_at: true,
        user: {
          id: true,
          username: true,
          email: true,
        },
      },
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }
}

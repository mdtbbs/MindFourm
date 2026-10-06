import { NotFoundException } from '@nestjs/common';
import { OperationAuditService } from './operation-audit.service';

function listBuilder(rows: any[] = [], total = rows.length) {
  const builder: any = {
    leftJoinAndSelect: jest.fn(() => builder),
    select: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    where: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    addOrderBy: jest.fn(() => builder),
    skip: jest.fn(() => builder),
    take: jest.fn(() => builder),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
    getOne: jest.fn(),
  };
  return builder;
}

describe('OperationAuditService', () => {
  it('applies bounded admin audit filters and paginates newest first', async () => {
    const row = {
      id: 7,
      user_id: 4,
      user: { id: 4, username: 'operator', email: 'operator@example.test' },
      action: 'resource.featured.add',
      target_type: 'resource',
      target_id: 9,
      details: JSON.stringify({ request_id: 'req_123', featured: true }),
      ip_address: '127.0.0.1',
      user_agent: 'fixture',
      created_at: new Date('2026-10-06T08:00:00Z'),
    };
    const builder = listBuilder([row], 101);
    const repository = { createQueryBuilder: jest.fn().mockReturnValue(builder) };
    const service = new OperationAuditService(repository as any);

    const result = await service.list({
      page: 2,
      limit: 999,
      user_id: 4,
      target_id: 9,
      action_prefix: 'resource.',
      target_type: 'resource',
      request_id: 'req_123',
      q: 'featured',
      since: new Date('2026-10-01T00:00:00Z'),
      until: new Date('2026-10-07T00:00:00Z'),
    });

    expect(result.pagination).toEqual({ page: 2, limit: 100, total: 101, totalPages: 2 });
    expect(result.data[0]).toMatchObject({ id: 7, action: 'resource.featured.add', user: { username: 'operator' } });
    expect(builder.andWhere).toHaveBeenCalledWith('log.user_id = :userId', { userId: 4 });
    expect(builder.andWhere).toHaveBeenCalledWith('log.target_id = :targetId', { targetId: 9 });
    expect(builder.andWhere).toHaveBeenCalledWith('log.action LIKE :actionPrefix', { actionPrefix: 'resource.%' });
    expect(builder.andWhere).toHaveBeenCalledWith('log.target_type = :targetType', { targetType: 'resource' });
    expect(builder.andWhere).toHaveBeenCalledWith(expect.stringContaining('JSON_EXTRACT'), { requestId: 'req_123' });
    expect(builder.andWhere).toHaveBeenCalledWith(expect.stringContaining('user.username LIKE :q'), { q: '%featured%' });
    expect(builder.skip).toHaveBeenCalledWith(100);
    expect(builder.take).toHaveBeenCalledWith(100);
    expect(builder.orderBy).toHaveBeenCalledWith('log.created_at', 'DESC');
    expect(builder.addOrderBy).toHaveBeenCalledWith('log.id', 'DESC');
  });

  it('returns parsed details for a single audit record and 404s missing ids', async () => {
    const row = {
      id: 8,
      user_id: null,
      user: null,
      action: 'system.reconcile',
      target_type: 'resource',
      target_id: 3,
      details: '{"fixed":2}',
      ip_address: null,
      user_agent: null,
      created_at: new Date('2026-10-06T08:00:00Z'),
    };
    const found = listBuilder();
    found.getOne.mockResolvedValue(row);
    const repository = { createQueryBuilder: jest.fn().mockReturnValue(found) };
    const service = new OperationAuditService(repository as any);

    await expect(service.detail(8)).resolves.toMatchObject({ id: 8, parsed_details: { fixed: 2 } });

    const missing = listBuilder();
    missing.getOne.mockResolvedValue(null);
    const missingService = new OperationAuditService({ createQueryBuilder: jest.fn().mockReturnValue(missing) } as any);
    await expect(missingService.detail(404)).rejects.toBeInstanceOf(NotFoundException);
  });
});

import { SecurityAccessLogsService } from './security-access-logs.service';

describe('SecurityAccessLogsService', () => {
  it('audits the filter field names before returning IP-bearing records', async () => {
    const query: any = {
      andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ ip_address: '198.51.100.9' }], 1]),
    };
    const repository: any = {
      createQueryBuilder: jest.fn(() => query), create: jest.fn((value) => value), save: jest.fn(),
    };
    const operationLogs = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new SecurityAccessLogsService(repository, operationLogs as any, { getNumber: jest.fn() } as any);
    const result = await service.search({ request_id: 'req-secret', ip_address: '198.51.100.9', page: 2, limit: 25 }, { id: 8 }, {
      headers: { 'x-real-ip': '203.0.113.4', 'user-agent': 'admin-agent' },
    });
    expect(result).toMatchObject({ total: 1, page: 2, limit: 25, totalPages: 1 });
    expect(query.andWhere).toHaveBeenCalledWith('entry.request_id = :requestId', { requestId: 'req-secret' });
    expect(operationLogs.log).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 8, action: 'security_access_logs.search', target_type: 'security_access_logs', ip_address: '203.0.113.4',
      details: JSON.stringify({ filter_fields: ['request_id', 'ip_address'], page: 2, limit: 25 }),
    }));
    const details = operationLogs.log.mock.calls[0][0].details;
    expect(details).not.toContain('req-secret');
    expect(details).not.toContain('198.51.100.9');
  });

  it('clamps page size and keeps an empty search on page one', async () => {
    const query: any = {
      andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const operationLogs = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new SecurityAccessLogsService({ createQueryBuilder: () => query } as any, operationLogs as any, { getNumber: jest.fn() } as any);
    await expect(service.search({ page: 0, limit: 500 }, { id: 1 }, { headers: {} })).resolves.toMatchObject({ page: 1, limit: 100, totalPages: 1 });
    expect(operationLogs.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'security_access_logs.view' }));
  });

  it('purges records using the configurable retention setting with a 90-day default and 365-day cap', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-03T03:00:00.000Z'));
    try {
      for (const [configured, days] of [[30, 30], [null, 90], [500, 365]] as const) {
        const repository: any = { delete: jest.fn().mockResolvedValue({ affected: 1 }) };
        const settings = { getNumber: jest.fn().mockResolvedValue(configured) };
        const service = new SecurityAccessLogsService(repository, { log: jest.fn() } as any, settings as any);

        await service.purgeExpired();

        expect(settings.getNumber).toHaveBeenCalledWith('security_access_log_retention_days');
        const condition = repository.delete.mock.calls[0][0].created_at;
        expect(condition.value).toEqual(new Date(Date.parse('2026-10-03T03:00:00.000Z') - days * 24 * 60 * 60 * 1000));
      }
    } finally {
      jest.useRealTimers();
    }
  });
});

import { LogsService } from './logs.service';

describe('LogsService.getLogs request id filter', () => {
  it('matches exact request_id values from valid JSON audit details', async () => {
    const queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 4 }], 1]),
    };
    const logsRepository = { createQueryBuilder: jest.fn(() => queryBuilder) };
    const service = new LogsService(logsRepository as any, {} as any);

    const result = await service.getLogs({
      page: 1,
      limit: 20,
      request_id: 'req-42',
      action: 'settings.update',
    });

    expect(queryBuilder.where).toHaveBeenCalledWith(
      "CASE WHEN JSON_VALID(log.details) THEN JSON_UNQUOTE(JSON_EXTRACT(log.details, '$.request_id')) ELSE NULL END = :requestId",
      { requestId: 'req-42' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('log.action = :action', { action: 'settings.update' });
    expect(result).toEqual({ data: [{ id: 4 }], total: 1, page: 1, limit: 20, totalPages: 1 });
  });
});

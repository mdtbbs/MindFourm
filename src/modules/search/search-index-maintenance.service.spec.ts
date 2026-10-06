import { ConflictException, NotFoundException } from '@nestjs/common';
import { SearchIndexMaintenanceService } from './search-index-maintenance.service';

describe('SearchIndexMaintenanceService', () => {
  it('reports expected index definitions and the most recent operation', async () => {
    const query = jest.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('SELECT VERSION()')) return [{ version: '5.7.44' }];
      if (sql.includes('information_schema.statistics')) {
        return parameters[1] === 'ft_search_posts'
          ? [{ index_name: 'ft_search_posts', index_type: 'FULLTEXT', columns_in_order: 'title,content' }]
          : [];
      }
      if (sql.includes('information_schema.tables')) return [{ engine: 'InnoDB', table_rows: 120 }];
      if (sql.includes('search_index_maintenance_runs')) return [{ id: 7, action: 'repair', status: 'completed' }];
      return [];
    });
    const service = new SearchIndexMaintenanceService({ query } as any);

    const status = await service.getStatus();

    expect(status.engine_version).toBe('5.7.44');
    expect(status.indexes[0]).toMatchObject({ key: 'topics', status: 'ready', estimated_rows: 120 });
    expect(status.indexes[0].latest_run).toMatchObject({ id: 7, status: 'completed' });
    expect(status.indexes.slice(1).every((item) => item.status === 'missing')).toBe(true);
  });

  it('repairs one missing index under a connection-scoped MySQL lock and records completion', async () => {
    const runnerQuery = jest.fn()
      .mockResolvedValueOnce([{ acquired: 1 }])
      .mockResolvedValueOnce({ insertId: 21 })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const runner = { connect: jest.fn(), query: runnerQuery, release: jest.fn() };
    const dataSource = { createQueryRunner: jest.fn().mockReturnValue(runner) };
    const service = new SearchIndexMaintenanceService(dataSource as any);

    await expect(service.run('topics', 'repair', 8)).resolves.toMatchObject({
      id: 21, index_key: 'topics', action: 'repair', status: 'completed', index_name: 'ft_search_posts',
    });
    expect(runnerQuery).toHaveBeenCalledWith(expect.stringContaining('ADD FULLTEXT INDEX `ft_search_posts`'));
    expect(runnerQuery).toHaveBeenCalledWith(expect.stringContaining("SET status = 'completed'"), expect.any(Array));
    expect(runnerQuery).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', ['mindforum:search-index-maintenance']);
    expect(runner.release).toHaveBeenCalled();
  });

  it('rejects a concurrent request before touching an index', async () => {
    const runnerQuery = jest.fn().mockResolvedValueOnce([{ acquired: 0 }]);
    const runner = { connect: jest.fn(), query: runnerQuery, release: jest.fn() };
    const service = new SearchIndexMaintenanceService({ createQueryRunner: () => runner } as any);

    await expect(service.run('topics', 'rebuild', 8)).rejects.toBeInstanceOf(ConflictException);
    expect(runnerQuery).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalled();
  });

  it('rejects keys outside the index allowlist', async () => {
    const service = new SearchIndexMaintenanceService({ createQueryRunner: jest.fn() } as any);
    await expect(service.run('users; DROP TABLE users', 'repair', 8)).rejects.toBeInstanceOf(NotFoundException);
  });
});

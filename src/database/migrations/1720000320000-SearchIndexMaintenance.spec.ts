import { SEARCH_INDEX_CATALOG } from '../../modules/search/search-index.catalog';
import { SearchIndexMaintenance1720000320000 } from './1720000320000-SearchIndexMaintenance';

function makeQueryRunner() {
  const indices = new Set<string>();
  const statements: string[] = [];
  const query = jest.fn(async (sql: string, parameters: unknown[] = []) => {
    if (sql.includes('information_schema.columns')) {
      return SEARCH_INDEX_CATALOG.flatMap((index) => index.columns.map((column) => ({
        table_name: index.table, column_name: column, data_type: column.endsWith('_markdown') || column === 'content' || column === 'description' ? 'text' : 'varchar',
      })));
    }
    if (sql.includes('information_schema.statistics')) {
      return indices.has(`${parameters[0]}:${parameters[1]}`) ? [{ present: 1 }] : [];
    }
    if (sql.includes('COUNT(*) AS count FROM search_index_maintenance_runs')) return [{ count: 0 }];
    statements.push(sql);
    const added = sql.match(/ALTER TABLE `([^`]+)` ADD FULLTEXT INDEX `([^`]+)`/i);
    if (added) indices.add(`${added[1]}:${added[2]}`);
    const dropped = sql.match(/ALTER TABLE `([^`]+)` DROP INDEX `([^`]+)`/i);
    if (dropped) indices.delete(`${dropped[1]}:${dropped[2]}`);
    return [];
  });
  return { runner: { query } as any, indices, statements, query };
}

describe('SearchIndexMaintenance migration', () => {
  it('creates the observable run table and native DML-maintained FULLTEXT indexes', async () => {
    const { runner, indices, statements } = makeQueryRunner();
    const migration = new SearchIndexMaintenance1720000320000();
    await migration.up(runner);

    expect(migration.transaction).toBe(false);
    expect(statements[0]).toContain('CREATE TABLE IF NOT EXISTS search_index_maintenance_runs');
    expect(indices.size).toBe(SEARCH_INDEX_CATALOG.length);
    for (const index of SEARCH_INDEX_CATALOG) {
      expect(statements.some((sql) => sql.includes(`ADD FULLTEXT INDEX \`${index.name}\``))).toBe(true);
    }
  });

  it('does not duplicate existing indexes and removes derived indexes on rollback', async () => {
    const { runner, indices, statements } = makeQueryRunner();
    indices.add('posts:ft_search_posts');
    const migration = new SearchIndexMaintenance1720000320000();
    await migration.up(runner);
    const postIndexAdds = statements.filter((sql) => sql.includes('ADD FULLTEXT INDEX `ft_search_posts`'));
    expect(postIndexAdds).toHaveLength(0);

    await migration.down(runner);
    expect(indices.size).toBe(0);
    expect(statements.some((sql) => sql.includes('DROP TABLE IF EXISTS search_index_maintenance_runs'))).toBe(true);
  });

  it('fails before creating run state when a catalog column is absent or non-text', async () => {
    const { runner, query, statements } = makeQueryRunner();
    query.mockImplementation(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('information_schema.columns')) return [{ table_name: 'posts', column_name: 'title', data_type: 'varchar' }];
      statements.push(sql);
      return [];
    });

    await expect(new SearchIndexMaintenance1720000320000().up(runner))
      .rejects.toThrow('Search FULLTEXT catalog requires a character column: posts.content');
    expect(statements).toHaveLength(0);
  });

  it('normalizes uppercase information_schema field names returned by mysql2', async () => {
    const { runner, query, statements } = makeQueryRunner();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.columns')) {
        return SEARCH_INDEX_CATALOG.flatMap((index) => index.columns.map((column) => ({
          TABLE_NAME: index.table,
          COLUMN_NAME: column,
          DATA_TYPE: column.endsWith('_markdown') || column === 'content' || column === 'description' ? 'text' : 'varchar',
        })));
      }
      statements.push(sql);
      return [];
    });

    await expect(new SearchIndexMaintenance1720000320000().up(runner)).resolves.toBeUndefined();
    expect(statements[0]).toContain('CREATE TABLE IF NOT EXISTS search_index_maintenance_runs');
    expect(statements.filter((sql) => sql.includes('ADD FULLTEXT INDEX'))).toHaveLength(SEARCH_INDEX_CATALOG.length);
  });
});

import { ResourcePublishedAt1720000350000 } from './1720000350000-ResourcePublishedAt';

describe('ResourcePublishedAt1720000350000', () => {
  /**
   * A stateful fake: DDL issued by the migration is visible to later
   * information_schema probes, which is what makes the idempotency guard worth
   * testing. `columnPresent`/`indexPresent` seed objects that already exist.
   */
  const buildQueryRunner = ({ columnPresent = false, indexPresent = false } = {}) => {
    const state: { column: boolean; index: boolean } = { column: columnPresent, index: indexPresent };
    return {
      state,
      query: jest.fn(async (sql: string) => {
        const statement = String(sql);
        if (statement.includes('information_schema.tables')) return [{ 1: 1 }];
        if (statement.includes('information_schema.columns')) return state.column ? [{ 1: 1 }] : [];
        if (statement.includes('information_schema.statistics')) return state.index ? [{ 1: 1 }] : [];
        if (statement.includes('ADD COLUMN `published_at`')) state.column = true;
        if (statement.includes('CREATE INDEX `idx_resources_published_at`')) state.index = true;
        return [{ affectedRows: 0 }];
      }),
    };
  };

  it('adds a nullable published_at column and its index on a schema that lacks them', async () => {
    const queryRunner = buildQueryRunner();
    await new ResourcePublishedAt1720000350000().up(queryRunner as any);

    const ddl = queryRunner.query.mock.calls.map(([sql]) => String(sql));
    expect(ddl.some((sql) => sql.includes('ADD COLUMN `published_at` DATETIME NULL'))).toBe(true);
    expect(ddl.some((sql) => sql.includes('CREATE INDEX `idx_resources_published_at`'))).toBe(true);
  });

  it('is idempotent: no DDL is emitted when the column and index already exist', async () => {
    const queryRunner = buildQueryRunner({ columnPresent: true, indexPresent: true });
    await new ResourcePublishedAt1720000350000().up(queryRunner as any);

    const ddl = queryRunner.query.mock.calls.map(([sql]) => String(sql));
    expect(ddl.some((sql) => sql.includes('ADD COLUMN'))).toBe(false);
    expect(ddl.some((sql) => sql.includes('CREATE INDEX'))).toBe(false);
    // The backfill still runs so a partially-populated table converges.
    expect(ddl.some((sql) => sql.startsWith('UPDATE resources'))).toBe(true);
  });

  it('backfills published_at only for rows that are public and still null', async () => {
    const queryRunner = buildQueryRunner();
    await new ResourcePublishedAt1720000350000().up(queryRunner as any);

    const backfill = queryRunner.query.mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.startsWith('UPDATE resources'));
    expect(backfill).toBeDefined();
    expect(backfill).toContain('COALESCE(published_at, created_at, updated_at)');
    // Idempotency: a rerun must not overwrite an existing publication date.
    expect(backfill).toContain('published_at IS NULL');
    expect(backfill).toContain("status IN ('approved', 'published')");
    expect(backfill).toContain('deleted_at IS NULL');
  });

  it('drops the column and its index on rollback', async () => {
    const queryRunner = buildQueryRunner();
    await new ResourcePublishedAt1720000350000().down(queryRunner as any);

    const ddl = queryRunner.query.mock.calls.map(([sql]) => String(sql));
    expect(ddl.some((sql) => sql.includes('DROP INDEX `idx_resources_published_at`'))).toBe(true);
    expect(ddl.some((sql) => sql.includes('DROP COLUMN `published_at`'))).toBe(true);
  });
});

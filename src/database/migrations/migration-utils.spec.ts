const decorator = () => () => undefined;

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  PrimaryColumn: decorator,
  Column: decorator,
  ManyToOne: decorator,
  OneToMany: decorator,
  ManyToMany: decorator,
  OneToOne: decorator,
  JoinColumn: decorator,
  JoinTable: decorator,
  CreateDateColumn: decorator,
  UpdateDateColumn: decorator,
  DeleteDateColumn: decorator,
  Index: decorator,
  Unique: decorator,
}));

import {
  addColumnIfMissing,
  addForeignKeyIfMissing,
  addUniqueIfMissing,
  columnExists,
  createIndexIfMissing,
  dropIndexIfPresent,
  foreignKeyExists,
  foreignKeyOnColumnExists,
  hasAnyBaseTables,
  indexExists,
  tableExists,
} from './migration-utils';

/**
 * A QueryRunner stub that answers information_schema probes from a routing table
 * and records every other statement, so a test can assert that no DDL was emitted.
 */
function createQueryRunner(
  routes: Array<{ match: RegExp; rows: unknown[] }> = [],
) {
  const statements: Array<{ sql: string; params?: unknown[] }> = [];

  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    statements.push({ sql, params });
    for (const route of routes) {
      if (route.match.test(sql)) {
        return route.rows;
      }
    }
    return [];
  });

  return { queryRunner: { query } as any, query, statements };
}

/** Statements that change the schema, as opposed to probing it. */
function ddlStatements(statements: Array<{ sql: string }>): string[] {
  return statements
    .map((statement) => statement.sql)
    .filter((sql) => /^\s*(ALTER|CREATE|DROP|UPDATE|DELETE)\b/i.test(sql));
}

const TABLE_PRESENT = { match: /information_schema\.tables/, rows: [{ 1: 1 }] };
const TABLE_ABSENT = { match: /information_schema\.tables/, rows: [] };
const COLUMN_PRESENT = { match: /information_schema\.columns/, rows: [{ 1: 1 }] };
const COLUMN_ABSENT = { match: /information_schema\.columns/, rows: [] };

describe('existence probes', () => {
  it('report presence when information_schema returns a row', async () => {
    const { queryRunner } = createQueryRunner([
      TABLE_PRESENT,
      COLUMN_PRESENT,
      { match: /information_schema\.statistics/, rows: [{ 1: 1 }] },
      { match: /information_schema\.table_constraints/, rows: [{ 1: 1 }] },
      { match: /information_schema\.key_column_usage/, rows: [{ 1: 1 }] },
    ]);

    await expect(hasAnyBaseTables(queryRunner)).resolves.toBe(true);
    await expect(tableExists(queryRunner, 'posts')).resolves.toBe(true);
    await expect(columnExists(queryRunner, 'posts', 'slug')).resolves.toBe(true);
    await expect(indexExists(queryRunner, 'posts', 'idx_posts_slug')).resolves.toBe(true);
    await expect(foreignKeyExists(queryRunner, 'attachments', 'fk_attachments_user')).resolves.toBe(true);
    await expect(foreignKeyOnColumnExists(queryRunner, 'attachments', 'user_id')).resolves.toBe(true);
  });

  it('excludes TypeORM\'s own migrations table from the emptiness check', async () => {
    // TypeORM creates `migrations` before running any migration, so counting it made
    // a fresh database look established: the baseline took its patch-an-existing-schema
    // branch and created nothing, while all six migrations recorded as applied.
    const { queryRunner, statements } = createQueryRunner([TABLE_PRESENT]);

    await hasAnyBaseTables(queryRunner);

    expect(statements[0].sql).toMatch(/table_name\s*<>\s*'migrations'/);
  });

  it('report absence when information_schema returns nothing', async () => {
    const { queryRunner } = createQueryRunner();

    await expect(hasAnyBaseTables(queryRunner)).resolves.toBe(false);
    await expect(tableExists(queryRunner, 'posts')).resolves.toBe(false);
    await expect(columnExists(queryRunner, 'posts', 'slug')).resolves.toBe(false);
    await expect(indexExists(queryRunner, 'posts', 'idx_posts_slug')).resolves.toBe(false);
    await expect(foreignKeyExists(queryRunner, 'attachments', 'fk_attachments_user')).resolves.toBe(false);
    await expect(foreignKeyOnColumnExists(queryRunner, 'attachments', 'user_id')).resolves.toBe(false);
  });

  it('scopes every probe to the connected schema', async () => {
    const { queryRunner, statements } = createQueryRunner();

    await tableExists(queryRunner, 'posts');

    // Without `table_schema = DATABASE()` the probe matches same-named tables in
    // other schemas on the same server and reports false positives.
    expect(statements[0].sql).toContain('table_schema = DATABASE()');
    expect(statements[0].params).toEqual(['posts']);
  });
});

describe('createIndexIfMissing', () => {
  it('creates the index when it is absent', async () => {
    const { queryRunner, statements } = createQueryRunner([TABLE_PRESENT, COLUMN_PRESENT]);

    await createIndexIfMissing(queryRunner, 'posts', 'idx_posts_status', ['status']);

    expect(ddlStatements(statements)).toEqual([
      'CREATE INDEX `idx_posts_status` ON `posts` (`status`)',
    ]);
  });

  it('issues no DDL when the index already exists', async () => {
    // A duplicate CREATE INDEX is a hard error in MySQL 8, and these migrations run
    // during DataSource.initialize() — it would take the process down on boot.
    const { queryRunner, statements } = createQueryRunner([
      TABLE_PRESENT,
      COLUMN_PRESENT,
      { match: /information_schema\.statistics/, rows: [{ 1: 1 }] },
    ]);

    await createIndexIfMissing(queryRunner, 'posts', 'idx_posts_status', ['status']);

    expect(ddlStatements(statements)).toEqual([]);
  });

  it('skips when the table is absent', async () => {
    const { queryRunner, statements } = createQueryRunner([TABLE_ABSENT]);

    await createIndexIfMissing(queryRunner, 'ghost', 'idx_ghost_status', ['status']);

    expect(ddlStatements(statements)).toEqual([]);
  });

  it('skips when an indexed column is absent', async () => {
    const { queryRunner, statements } = createQueryRunner([TABLE_PRESENT, COLUMN_ABSENT]);

    await createIndexIfMissing(queryRunner, 'posts', 'idx_posts_missing', ['nope']);

    expect(ddlStatements(statements)).toEqual([]);
  });

  it('quotes each column of a composite index', async () => {
    const { queryRunner, statements } = createQueryRunner([TABLE_PRESENT, COLUMN_PRESENT]);

    await createIndexIfMissing(
      queryRunner,
      'replies',
      'idx_replies_post_deleted_created',
      ['post_id', 'deleted_at', 'created_at'],
    );

    expect(ddlStatements(statements)).toEqual([
      'CREATE INDEX `idx_replies_post_deleted_created` ON `replies` (`post_id`, `deleted_at`, `created_at`)',
    ]);
  });
});

describe('dropIndexIfPresent', () => {
  it('drops an index that exists', async () => {
    const { queryRunner, statements } = createQueryRunner([
      TABLE_PRESENT,
      { match: /information_schema\.statistics/, rows: [{ 1: 1 }] },
    ]);

    await dropIndexIfPresent(queryRunner, 'email_logs', 'idx_email_logs_user');

    expect(ddlStatements(statements)).toEqual([
      'DROP INDEX `idx_email_logs_user` ON `email_logs`',
    ]);
  });

  it('issues no DDL when the index is absent', async () => {
    const { queryRunner, statements } = createQueryRunner([TABLE_PRESENT]);

    await dropIndexIfPresent(queryRunner, 'email_logs', 'idx_email_logs_user');

    expect(ddlStatements(statements)).toEqual([]);
  });
});

describe('addColumnIfMissing', () => {
  it('adds the column when absent', async () => {
    const { queryRunner, statements } = createQueryRunner([TABLE_PRESENT, COLUMN_ABSENT]);

    await addColumnIfMissing(queryRunner, 'posts', 'slug', 'VARCHAR(100) NULL');

    expect(ddlStatements(statements)).toEqual([
      'ALTER TABLE `posts` ADD COLUMN `slug` VARCHAR(100) NULL',
    ]);
  });

  it('issues no DDL when the column is present', async () => {
    const { queryRunner, statements } = createQueryRunner([TABLE_PRESENT, COLUMN_PRESENT]);

    await addColumnIfMissing(queryRunner, 'posts', 'slug', 'VARCHAR(100) NULL');

    expect(ddlStatements(statements)).toEqual([]);
  });

  it('issues no DDL when the table is absent', async () => {
    const { queryRunner, statements } = createQueryRunner([TABLE_ABSENT]);

    await addColumnIfMissing(queryRunner, 'ghost', 'slug', 'VARCHAR(100) NULL');

    expect(ddlStatements(statements)).toEqual([]);
  });
});

describe('addUniqueIfMissing', () => {
  it('adds the constraint when no unique index spans the columns', async () => {
    const { queryRunner, statements } = createQueryRunner([TABLE_PRESENT, COLUMN_PRESENT]);

    await addUniqueIfMissing(queryRunner, 'bookmarks', 'uq_bookmarks_user_post', [
      'user_id',
      'post_id',
    ]);

    expect(ddlStatements(statements)).toEqual([
      'ALTER TABLE `bookmarks` ADD CONSTRAINT `uq_bookmarks_user_post` UNIQUE (`user_id`, `post_id`)',
    ]);
  });

  it('skips when a differently named unique index already spans the columns', async () => {
    // The historical DDL named this `unique_version`, so matching on our own naming
    // convention alone would add a second, redundant constraint.
    const { queryRunner, statements } = createQueryRunner([
      TABLE_PRESENT,
      COLUMN_PRESENT,
      { match: /information_schema\.statistics/, rows: [{ index_name: 'unique_version' }] },
    ]);

    await addUniqueIfMissing(queryRunner, 'resource_versions', 'uq_resource_versions_resource_version', [
      'resource_id',
      'version',
    ]);

    expect(ddlStatements(statements)).toEqual([]);
  });

  it('warns and skips rather than crashing when duplicate rows exist', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { queryRunner, statements } = createQueryRunner([
      TABLE_PRESENT,
      COLUMN_PRESENT,
      { match: /HAVING COUNT\(\*\) > 1/, rows: [{ user_id: 1, post_id: 2 }] },
    ]);

    await addUniqueIfMissing(queryRunner, 'bookmarks', 'uq_bookmarks_user_post', [
      'user_id',
      'post_id',
    ]);

    // The alternative — letting InnoDB reject the constraint — leaves the service
    // unable to boot until an operator picks which duplicate row to keep.
    expect(ddlStatements(statements)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('uq_bookmarks_user_post'));
    warn.mockRestore();
  });
});

describe('addForeignKeyIfMissing', () => {
  it('clears orphans before adding a SET NULL constraint', async () => {
    const { queryRunner, statements } = createQueryRunner([TABLE_PRESENT, COLUMN_PRESENT]);

    await addForeignKeyIfMissing(
      queryRunner, 'session_audit', 'fk_session_audit_user', 'user_id', 'users', 'id', 'SET NULL',
    );

    const ddl = ddlStatements(statements);
    expect(ddl[0]).toContain('UPDATE `session_audit`');
    expect(ddl[0]).toContain('= NULL');
    expect(ddl[1]).toContain('ADD CONSTRAINT `fk_session_audit_user`');
    expect(ddl[1]).toContain('ON DELETE SET NULL');
  });

  it('warns and skips a CASCADE constraint when orphan rows exist', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { queryRunner, statements } = createQueryRunner([
      TABLE_PRESENT,
      COLUMN_PRESENT,
      { match: /NOT EXISTS/, rows: [{ 1: 1 }] },
    ]);

    await addForeignKeyIfMissing(
      queryRunner, 'attachments', 'fk_attachments_user', 'user_id', 'users', 'id', 'CASCADE',
    );

    expect(ddlStatements(statements)).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('fk_attachments_user'));
    warn.mockRestore();
  });

  it('skips when the column already has any foreign key', async () => {
    const { queryRunner, statements } = createQueryRunner([
      TABLE_PRESENT,
      COLUMN_PRESENT,
      { match: /information_schema\.key_column_usage/, rows: [{ 1: 1 }] },
    ]);

    await addForeignKeyIfMissing(
      queryRunner, 'resource_versions', 'fk_resource_versions_resource', 'resource_id', 'resources', 'id', 'CASCADE',
    );

    expect(ddlStatements(statements)).toEqual([]);
  });

  it('skips when the referenced table does not exist', async () => {
    const { queryRunner, statements } = createQueryRunner([TABLE_ABSENT]);

    await addForeignKeyIfMissing(
      queryRunner, 'attachments', 'fk_attachments_reply', 'reply_id', 'replies', 'id', 'CASCADE',
    );

    expect(ddlStatements(statements)).toEqual([]);
  });
});

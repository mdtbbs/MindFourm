import { QueryRunner } from 'typeorm';

/**
 * information_schema guards for MySQL 8 migrations.
 *
 * MySQL 8 supports neither `CREATE INDEX IF NOT EXISTS` nor `ADD COLUMN IF NOT
 * EXISTS`, and a duplicate `CREATE INDEX` is a hard error — which, because
 * migrations run during `DataSource.initialize()`, takes the whole process down on
 * boot. Every helper here therefore probes information_schema before emitting DDL.
 *
 * Idempotency is load-bearing rather than defensive: a fresh database gets these
 * objects from the baseline migration's entity-metadata synchronize, while an
 * existing database gets them from the explicit DDL in later migrations. Both
 * paths have to converge on one schema.
 */

/**
 * True when the schema already holds application tables.
 *
 * TypeORM's own `migrations` bookkeeping table is excluded, and this is the whole
 * point of the function: TypeORM creates that table *before* running any migration,
 * so counting it made a genuinely empty database look like an existing one. The
 * baseline then took its "patch an existing schema" branch, patched tables that did
 * not exist, and every later migration skipped through its idempotency guards — all
 * six recorded as applied against a database containing nothing but `migrations`.
 */
export async function hasAnyBaseTables(queryRunner: QueryRunner): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
        AND table_name <> 'migrations'
      LIMIT 1`,
  );
  return rows.length > 0;
}

export async function tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND table_type = 'BASE TABLE'
      LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

export async function columnExists(
  queryRunner: QueryRunner,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

export async function indexExists(
  queryRunner: QueryRunner,
  table: string,
  index: string,
): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT 1
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      LIMIT 1`,
    [table, index],
  );
  return rows.length > 0;
}

export async function foreignKeyExists(
  queryRunner: QueryRunner,
  table: string,
  constraint: string,
): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT 1
       FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND constraint_name = ?
        AND constraint_type = 'FOREIGN KEY'
      LIMIT 1`,
    [table, constraint],
  );
  return rows.length > 0;
}

/**
 * True when *any* foreign key already covers `column`, whatever it is called.
 *
 * The historical DDL created its constraints without explicit names, so MySQL
 * assigned `<table>_ibfk_N`. Matching on our own naming convention alone would
 * add a second, redundant constraint to those databases.
 */
export async function foreignKeyOnColumnExists(
  queryRunner: QueryRunner,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT 1
       FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
        AND referenced_table_name IS NOT NULL
      LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

/**
 * True when a unique index (or the primary key) already spans exactly `columns`,
 * in order, under any name — the same naming problem as
 * {@link foreignKeyOnColumnExists}, plus legacy names like `unique_version`.
 */
export async function uniqueIndexOnColumnsExists(
  queryRunner: QueryRunner,
  table: string,
  columns: string[],
): Promise<boolean> {
  const rows = await queryRunner.query(
    `SELECT index_name
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND non_unique = 0
      GROUP BY index_name
     HAVING GROUP_CONCAT(column_name ORDER BY seq_in_index) = ?`,
    [table, columns.join(',')],
  );
  return rows.length > 0;
}

export async function addColumnIfMissing(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (await columnExists(queryRunner, table, column)) return;
  await queryRunner.query(
    `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
  );
}

export async function createIndexIfMissing(
  queryRunner: QueryRunner,
  table: string,
  index: string,
  columns: string[],
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (await indexExists(queryRunner, table, index)) return;

  // A column named in the index but absent from the table means the two schema
  // sources disagree; skipping beats aborting the boot on a partial database.
  for (const column of columns) {
    if (!(await columnExists(queryRunner, table, column))) return;
  }

  const columnList = columns.map((column) => `\`${column}\``).join(', ');
  await queryRunner.query(
    `CREATE INDEX \`${index}\` ON \`${table}\` (${columnList})`,
  );
}

export async function dropIndexIfPresent(
  queryRunner: QueryRunner,
  table: string,
  index: string,
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (!(await indexExists(queryRunner, table, index))) return;
  await queryRunner.query(`DROP INDEX \`${index}\` ON \`${table}\``);
}

/**
 * Add a unique constraint, unless one already spans the same columns.
 *
 * Skips (loudly) when the existing rows contain duplicates: a boot-time migration
 * that throws leaves the service unable to start, and an operator has to decide
 * which of the duplicate rows to keep.
 */
export async function addUniqueIfMissing(
  queryRunner: QueryRunner,
  table: string,
  constraint: string,
  columns: string[],
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (await uniqueIndexOnColumnsExists(queryRunner, table, columns)) return;

  for (const column of columns) {
    if (!(await columnExists(queryRunner, table, column))) return;
  }

  const columnList = columns.map((column) => `\`${column}\``).join(', ');
  const duplicates = await queryRunner.query(
    `SELECT ${columnList}
       FROM \`${table}\`
      GROUP BY ${columnList}
     HAVING COUNT(*) > 1
      LIMIT 1`,
  );

  if (duplicates.length > 0) {
    console.warn(
      `[migration] Skipping unique constraint ${constraint} on ${table}(${columns.join(', ')}): ` +
      'duplicate rows exist. De-duplicate them and re-run the migration.',
    );
    return;
  }

  await queryRunner.query(
    `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraint}\` UNIQUE (${columnList})`,
  );
}

/**
 * Add a foreign key, unless the column already has one.
 *
 * Rows pointing at a missing parent make InnoDB reject the constraint. When the
 * column is nullable those orphans are cleared first (which is what `ON DELETE SET
 * NULL` would have done); otherwise the constraint is skipped with a warning
 * rather than crashing the boot on legacy data.
 */
export async function addForeignKeyIfMissing(
  queryRunner: QueryRunner,
  table: string,
  constraint: string,
  column: string,
  referencedTable: string,
  referencedColumn: string,
  onDelete: 'CASCADE' | 'SET NULL',
): Promise<void> {
  if (!(await tableExists(queryRunner, table))) return;
  if (!(await tableExists(queryRunner, referencedTable))) return;
  if (!(await columnExists(queryRunner, table, column))) return;
  if (await foreignKeyOnColumnExists(queryRunner, table, column)) return;

  if (onDelete === 'SET NULL') {
    await queryRunner.query(
      `UPDATE \`${table}\` child
          SET child.\`${column}\` = NULL
        WHERE child.\`${column}\` IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM \`${referencedTable}\` parent
             WHERE parent.\`${referencedColumn}\` = child.\`${column}\`
          )`,
    );
  } else {
    const orphans = await queryRunner.query(
      `SELECT 1
         FROM \`${table}\` child
        WHERE child.\`${column}\` IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM \`${referencedTable}\` parent
             WHERE parent.\`${referencedColumn}\` = child.\`${column}\`
          )
        LIMIT 1`,
    );
    if (orphans.length > 0) {
      console.warn(
        `[migration] Skipping foreign key ${constraint} on ${table}.${column}: ` +
        `rows reference missing ${referencedTable} rows. Clean them up and re-run the migration.`,
      );
      return;
    }
  }

  await queryRunner.query(
    `ALTER TABLE \`${table}\`
       ADD CONSTRAINT \`${constraint}\`
       FOREIGN KEY (\`${column}\`) REFERENCES \`${referencedTable}\` (\`${referencedColumn}\`)
       ON DELETE ${onDelete}`,
  );
}

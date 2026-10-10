import { GenericBlobApi1720000360000 } from './1720000360000-GenericBlobApi';

/** The migration guards every table with `tableExists`, so each check costs a query. */
function runner(existing: string[] = []) {
  const queries: string[] = [];
  return {
    queries,
    query: jest.fn(async (sql: string, parameters: unknown[] = []) => {
      queries.push(sql);
      if (sql.includes('FROM information_schema.tables')) {
        // `tableExists` passes the name as a bound parameter.
        return existing.includes(String(parameters[0])) ? [{ exists: 1 }] : [];
      }
      return [];
    }),
  };
}

describe('GenericBlobApi1720000360000', () => {
  it('creates the blob object, binding, upload session and idempotency tables', async () => {
    const queryRunner = runner();
    await new GenericBlobApi1720000360000().up(queryRunner as any);

    const ddl = queryRunner.queries.filter((sql) => sql.startsWith('CREATE TABLE'));
    expect(ddl).toHaveLength(4);
    expect(ddl[0]).toContain('CREATE TABLE blob_objects');
    expect(ddl[1]).toContain('CREATE TABLE blob_records');
    expect(ddl[2]).toContain('CREATE TABLE blob_upload_sessions');
    expect(ddl[3]).toContain('CREATE TABLE blob_idempotency');
  });

  it('deduplicates content per owner inside a namespace and keeps the GC claim columns', async () => {
    const queryRunner = runner();
    await new GenericBlobApi1720000360000().up(queryRunner as any);

    const objects = queryRunner.queries.find((sql) => sql.includes('CREATE TABLE blob_objects'))!;
    expect(objects).toContain('UNIQUE KEY uq_blob_object_owner_content (namespace, owner_type, owner_id, sha256, size_bytes)');
    expect(objects).toContain('ref_count INT UNSIGNED NOT NULL DEFAULT 0');
    expect(objects).toContain('gc_in_progress TINYINT(1) NOT NULL DEFAULT 0');
    expect(objects).toContain('pending_delete_at DATETIME NULL');
  });

  it('makes a deleted blob key reusable while keeping tombstone rows', async () => {
    const queryRunner = runner();
    await new GenericBlobApi1720000360000().up(queryRunner as any);

    const records = queryRunner.queries.find((sql) => sql.includes('CREATE TABLE blob_records'))!;
    // `active_slot` is part of the unique key precisely so a soft-deleted row
    // (NULL) stops occupying the name.
    expect(records).toContain('UNIQUE KEY uq_blob_record_owner_key (namespace, owner_type, owner_id, blob_key, active_slot)');
    expect(records).toContain('active_slot SMALLINT UNSIGNED NULL DEFAULT 1');
    expect(records).toContain('deleted_at DATETIME NULL');
  });

  it('keeps the blob lifetime separate from the upload session lifetime', async () => {
    const queryRunner = runner();
    await new GenericBlobApi1720000360000().up(queryRunner as any);

    const sessions = queryRunner.queries.find((sql) => sql.includes('CREATE TABLE blob_upload_sessions'))!;
    expect(sessions).toContain('record_expires_at DATETIME NULL');
    expect(sessions).toContain("status VARCHAR(16) NOT NULL DEFAULT 'pending'");
  });

  it('is re-runnable against a database that already has the tables', async () => {
    const queryRunner = runner(['blob_objects', 'blob_records', 'blob_upload_sessions', 'blob_idempotency']);
    await new GenericBlobApi1720000360000().up(queryRunner as any);
    expect(queryRunner.queries.some((sql) => sql.startsWith('CREATE TABLE'))).toBe(false);
  });

  it('drops only its own tables on rollback', async () => {
    const queryRunner = runner();
    await new GenericBlobApi1720000360000().down(queryRunner as any);
    expect(queryRunner.queries).toEqual([
      'DROP TABLE IF EXISTS blob_idempotency',
      'DROP TABLE IF EXISTS blob_upload_sessions',
      'DROP TABLE IF EXISTS blob_records',
      'DROP TABLE IF EXISTS blob_objects',
    ]);
  });
});

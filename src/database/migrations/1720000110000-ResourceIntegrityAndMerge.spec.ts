import { ResourceIntegrityAndMerge1720000110000 } from './1720000110000-ResourceIntegrityAndMerge';

describe('ResourceIntegrityAndMerge1720000110000', () => {
  it('creates additive hash claims, idempotency, and merge audit tables on a fresh install', async () => {
    const created: string[] = [];
    const runner = {
      getTable: jest.fn().mockResolvedValue(null),
      hasTable: jest.fn(async (name: string) => created.includes(name)),
      createTable: jest.fn(async (table: { name: string }) => { created.push(table.name); }),
      query: jest.fn(),
    };

    await new ResourceIntegrityAndMerge1720000110000().up(runner as any);

    expect(created).toEqual(expect.arrayContaining([
      'resource_content_hash_claims', 'resource_structure_hash_claims', 'resource_submission_idempotency', 'resource_merge_logs',
    ]));
    const idempotency = runner.createTable.mock.calls.find(([table]) => table.name === 'resource_submission_idempotency')?.[0];
    expect(idempotency.columns.map((column: { name: string }) => column.name)).toEqual(expect.arrayContaining([
      'user_id', 'idempotency_key', 'request_fingerprint', 'payload_fingerprint', 'resource_id', 'expires_at',
    ]));
    expect(runner.query).not.toHaveBeenCalled();
  });

  it('reports unmapped legacy categories and only updates missing or invalid resource kinds', async () => {
    const calls: string[] = [];
    const existingTable = { findColumnByName: () => ({ name: 'present' }), indices: [] };
    const runner = {
      getTable: jest.fn().mockResolvedValue(existingTable),
      hasTable: jest.fn().mockResolvedValue(true),
      createIndex: jest.fn(),
      addColumn: jest.fn(),
      query: jest.fn(async (sql: string) => {
        calls.push(sql);
        return sql.includes('SELECT COUNT(*)') ? [{ count: 3 }] : undefined;
      }),
    };
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    await new ResourceIntegrityAndMerge1720000110000().up(runner as any);

    const ambiguous = calls.find((sql) => sql.includes('SELECT COUNT(*)')) || '';
    const mapping = calls.find((sql) => sql.includes('UPDATE resources r LEFT JOIN resource_categories')) || '';
    expect(ambiguous).toContain('AND (c.id IS NULL OR');
    expect(mapping).toContain("WHEN LOWER(CONCAT(COALESCE(c.slug,''),' ',COALESCE(c.name,''))) REGEXP 'blueprint|schematic|蓝图' THEN 'schematic'");
    expect(mapping).toContain("WHEN LOWER(CONCAT(COALESCE(c.slug,''),' ',COALESCE(c.name,''))) REGEXP 'map|地图' THEN 'map'");
    expect(mapping).toContain('WHERE r.resource_kind IS NULL OR r.resource_kind =');
    expect(mapping).toContain("'server_plugin','development_tool','texture_ui','other'");
    expect(mapping).not.toContain('DELETE FROM resources');
    expect(info).toHaveBeenCalledWith(expect.stringContaining('unmapped legacy resource kinds: 3'));
    info.mockRestore();
  });

  it('resumes hash claim backfills safely when the claim table already exists', async () => {
    const calls: string[] = [];
    const runner = {
      getTable: jest.fn().mockResolvedValue({
        findColumnByName: () => ({ name: 'present' }),
        indices: [],
      }),
      hasTable: jest.fn().mockResolvedValue(true),
      createTable: jest.fn(),
      createIndex: jest.fn(),
      addColumn: jest.fn(),
      query: jest.fn(async (sql: string) => { calls.push(sql); return [{ count: 0 }]; }),
    };
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    await new ResourceIntegrityAndMerge1720000110000().up(runner as any);

    expect(runner.createTable).not.toHaveBeenCalled();
    expect(calls.some((sql) => sql.includes('INSERT IGNORE INTO resource_content_hash_claims') && sql.includes('FROM resources'))).toBe(true);
    expect(calls.some((sql) => sql.includes('INSERT IGNORE INTO resource_content_hash_claims') && sql.includes('FROM resource_versions'))).toBe(true);
    expect(calls.some((sql) => sql.includes('INSERT IGNORE INTO resource_content_hash_claims') && sql.includes('FROM resource_files'))).toBe(true);
    info.mockRestore();
  });
});

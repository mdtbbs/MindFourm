import { CloudSaveManifestSnapshots1720000400000 } from './1720000400000-CloudSaveManifestSnapshots';

describe('CloudSaveManifestSnapshots migration', () => {
  it('makes blob_id nullable and creates the file and blob staging tables', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new CloudSaveManifestSnapshots1720000400000().up({ query } as any);
    const ddl = query.mock.calls.map(([sql]) => String(sql)).join('\n');

    expect(ddl).toContain('MODIFY COLUMN blob_id CHAR(36) NULL');
    expect(ddl).toContain("ADD COLUMN format ENUM('zip','manifest')");
    expect(ddl).toContain('CREATE TABLE game_save_snapshot_files');
    expect(ddl).toContain('CREATE TABLE game_save_blob_uploads');
    expect(ddl).toContain('UNIQUE KEY uq_game_save_snapshot_file_path (snapshot_id, path)');
    expect(ddl).toContain('FOREIGN KEY (blob_id) REFERENCES game_save_blobs(id) ON DELETE RESTRICT');
  });

  it('checks for manifest snapshots first, then drops child tables before restoring NOT NULL', async () => {
    const query = jest.fn(async (sql: string) => (sql.includes('SELECT COUNT(*)') ? [{ count: 0 }] : undefined));
    await new CloudSaveManifestSnapshots1720000400000().down({ query } as any);
    const statements = query.mock.calls.map(([sql]) => String(sql));

    expect(statements[0]).toContain('SELECT COUNT(*)');
    expect(statements[1]).toContain('DROP TABLE IF EXISTS game_save_blob_uploads');
    expect(statements[2]).toContain('DROP TABLE IF EXISTS game_save_snapshot_files');
    expect(statements.at(-1)).toContain('MODIFY COLUMN blob_id CHAR(36) NOT NULL');
  });

  it('refuses to revert while manifest snapshots still exist', async () => {
    const query = jest.fn(async (sql: string) => (sql.includes('SELECT COUNT(*)') ? [{ count: 2 }] : undefined));
    await expect(new CloudSaveManifestSnapshots1720000400000().down({ query } as any))
      .rejects.toThrow('manifest snapshots');
  });
});

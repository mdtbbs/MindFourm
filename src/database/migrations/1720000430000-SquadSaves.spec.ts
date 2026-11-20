import { SquadSaves1720000430000 } from './1720000430000-SquadSaves';

describe('SquadSaves migration', () => {
  it('creates every squad table when the database does not have them yet', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('information_schema.tables')) return [];
      if (sql.includes('SELECT COUNT(*) AS count FROM squads')) return [{ count: 0 }];
      return undefined;
    });
    await new SquadSaves1720000430000().up({ query } as any);
    const ddl = query.mock.calls.map(([sql]) => String(sql)).join('\n');

    for (const table of [
      'squads', 'squad_members', 'squad_ownership_transfers', 'squad_save_slots', 'squad_save_leases',
      'squad_save_blobs', 'squad_save_snapshots', 'squad_save_snapshot_files', 'squad_save_blob_uploads',
    ]) {
      expect(ddl).toContain(`CREATE TABLE ${table} `);
    }
    expect(ddl).toContain('UNIQUE KEY uq_squad_member (squad_id, user_id)');
    expect(ddl).toContain('UNIQUE KEY uq_squad_blob_sha_size (squad_id, sha256, size_bytes)');
    expect(ddl).toContain("ENUM('main','conflict')");
    expect(ddl).toContain('mods_manifest_json JSON NULL');
    expect(ddl).toContain('mods_manifest_hash CHAR(64) NULL');
    expect(ddl).toContain('previous_holder_user_id INT NULL');
    expect(ddl).toContain('previous_fencing_token BIGINT UNSIGNED NULL');
    expect(ddl).toContain('PRIMARY KEY (snapshot_id, file_path)');
    expect(ddl).toContain('FOREIGN KEY (blob_id) REFERENCES squad_save_blobs(id) ON DELETE RESTRICT');
    expect(ddl).toContain('FOREIGN KEY (slot_id) REFERENCES squad_save_slots(id) ON DELETE CASCADE');
  });

  it('skips tables that the baseline synchronize path already materialised', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('information_schema.tables')) return [{ 1: 1 }];
      if (sql.includes('information_schema.columns')) return [{ 1: 1 }];
      return undefined;
    });
    await new SquadSaves1720000430000().up({ query } as any);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('CREATE TABLE'))).toBe(false);
  });

  it('refuses to drop tables while active squads still exist', async () => {
    const query = jest.fn(async (sql: string) => (sql.includes('SELECT COUNT(*)') ? [{ count: 2 }] : undefined));
    await expect(new SquadSaves1720000430000().down({ query } as any)).rejects.toThrow('active squads');
  });

  it('drops child tables before the squad root', async () => {
    const query = jest.fn(async (sql: string) => (sql.includes('SELECT COUNT(*)') ? [{ count: 0 }] : undefined));
    await new SquadSaves1720000430000().down({ query } as any);
    const statements = query.mock.calls.map(([sql]) => String(sql));
    const drops = statements.filter((sql) => sql.startsWith('DROP TABLE'));
    expect(drops).toHaveLength(9);
    expect(drops[0]).toContain('squad_save_blob_uploads');
    expect(drops.at(-1)).toContain('squads');
  });
});

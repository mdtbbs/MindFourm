import { MultiplayerSessionMods1720000410000 } from './1720000410000-MultiplayerSessionMods';

/**
 * 迁移测试不连数据库：按 SQL 文本区分 information_schema 探测与 DDL，
 * 并断言幂等守卫、表结构与回滚保护都真实存在。
 */
describe('MultiplayerSessionMods migration', () => {
  /** 新库路径：会话表已存在，但新列/新表/新索引都不存在。 */
  const upQuery = () => jest.fn(async (sql: string, params?: unknown[]) => {
    const text = String(sql);
    if (text.includes('information_schema.tables')) {
      return params?.[0] === 'multiplayer_session_mods' ? [] : [{ 1: 1 }];
    }
    if (text.includes('information_schema')) return [];
    return undefined;
  });

  it('adds the session counters and creates the session mod table', async () => {
    const query = upQuery();
    await new MultiplayerSessionMods1720000410000().up({ query } as any);
    const ddl = query.mock.calls.map(([sql]) => String(sql)).join('\n');

    expect(ddl).toContain('ADD COLUMN `mod_pack_version_id` INT NULL');
    expect(ddl).toContain('ADD COLUMN `is_modded` TINYINT(1) NOT NULL DEFAULT 0');
    expect(ddl).toContain('ADD COLUMN `mod_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0');
    expect(ddl).toContain('ADD COLUMN `mod_syncable_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0');
    expect(ddl).toContain('CREATE TABLE multiplayer_session_mods');
    expect(ddl).toContain("resolution_status ENUM('catalog_verified','catalog_version_mismatch','unlisted_local')");
    expect(ddl).toContain('UNIQUE KEY uq_multiplayer_session_mods_session_mod (session_id, mod_id)');
    expect(ddl).toContain('KEY idx_multiplayer_session_mods_mod_session (mod_id, session_id)');
    expect(ddl).toContain('KEY idx_multiplayer_session_mods_resource_session (resource_id, session_id)');
    expect(ddl).toContain('FOREIGN KEY (session_id)');
    expect(ddl).toContain('REFERENCES multiplayer_sessions(id) ON DELETE CASCADE');
  });

  it('is idempotent: existing columns, indexes and table emit no duplicate DDL', async () => {
    // 所有 information_schema 探测都返回一行：列/索引/表均视为存在。
    const query = jest.fn(async (sql: string) => (String(sql).includes('information_schema') ? [{ 1: 1 }] : undefined));
    await new MultiplayerSessionMods1720000410000().up({ query } as any);
    const ddl = query.mock.calls.map(([sql]) => String(sql)).join('\n');

    expect(ddl).not.toContain('ADD COLUMN');
    expect(ddl).not.toContain('CREATE TABLE');
    expect(ddl).not.toContain('CREATE INDEX');
  });

  it('refuses to revert while session mod rows still exist', async () => {
    const query = jest.fn(async (sql: string) => {
      if (String(sql).includes('SELECT COUNT(*) AS count FROM multiplayer_session_mods')) return [{ count: 2 }];
      if (String(sql).includes('information_schema')) return [{ 1: 1 }];
      return undefined;
    });
    await expect(new MultiplayerSessionMods1720000410000().down({ query } as any))
      .rejects.toThrow('Cannot revert MultiplayerSessionMods');
  });

  it('drops the table, index and columns when the table is empty', async () => {
    const query = jest.fn(async (sql: string) => {
      if (String(sql).includes('SELECT COUNT(*) AS count FROM multiplayer_session_mods')) return [{ count: 0 }];
      if (String(sql).includes('information_schema')) return [{ 1: 1 }];
      return undefined;
    });
    await new MultiplayerSessionMods1720000410000().down({ query } as any);
    const ddl = query.mock.calls.map(([sql]) => String(sql)).join('\n');

    expect(ddl).toContain('DROP TABLE IF EXISTS multiplayer_session_mods');
    expect(ddl).toContain('DROP INDEX `idx_multiplayer_sessions_mod_pack`');
    expect(ddl).toContain('DROP COLUMN `mod_syncable_count`');
    expect(ddl).toContain('DROP COLUMN `mod_pack_version_id`');
  });
});

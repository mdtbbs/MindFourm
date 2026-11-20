import {
  getSaveQuotaUsage,
  lockBillingUsers,
  ownedSquadPendingRows,
  personalPendingRows,
} from './save-quota';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function managerWith(handler: (sql: string, parameters: any[]) => unknown) {
  const query = jest.fn(async (sql: string, parameters: any[] = []) => handler(sql, parameters));
  return { manager: { query } as any, query };
}

describe('save-quota 云存档配额核算', () => {
  it('汇总个人 blob、名下小队 blob 与两类暂存预留', async () => {
    const { manager, query } = managerWith((sql) => {
      if (sql.includes('FROM game_save_blobs WHERE user_id=?')) return [{ size_bytes: '1000' }];
      if (sql.includes('JOIN squads sq ON sq.id = b.squad_id')) return [{ size_bytes: '2000' }];
      if (sql.includes('FROM game_save_upload_sessions s')) return [{ sha256: HASH_A, size_bytes: '100' }];
      if (sql.includes('FROM game_save_blob_uploads u')) return [{ sha256: HASH_B, size_bytes: '200' }];
      if (sql.includes('FROM squad_save_blob_uploads u')) return [{ squad_id: 'squad-1', sha256: HASH_C, size_bytes: '300' }];
      return [];
    });

    await expect(getSaveQuotaUsage(manager, 17)).resolves.toEqual({
      personal_bytes: 1000,
      owned_squads_bytes: 2000,
      pending_bytes: 600,
      used_bytes: 3600,
    });
    expect(query).toHaveBeenCalledTimes(5);
  });

  it('个人暂存按 sha256+size 去重，已被引用内容由 NOT EXISTS 排除', async () => {
    const { manager, query } = managerWith((sql) => {
      if (sql.includes('FROM game_save_upload_sessions s')) {
        return [
          { sha256: HASH_A, size_bytes: '10' },
          { sha256: HASH_A, size_bytes: '10' },
        ];
      }
      if (sql.includes('FROM game_save_blob_uploads u')) {
        // HASH_C 已被 ref_count>0 的 blob 引用，真实 SQL 的 NOT EXISTS 会把它排除。
        return [
          { sha256: HASH_A, size_bytes: '10' },
          { sha256: HASH_B, size_bytes: '20' },
        ];
      }
      return [];
    });

    await expect(personalPendingRows(manager, 17)).resolves.toEqual([
      { sha256: HASH_A, size_bytes: '10' },
      { sha256: HASH_B, size_bytes: '20' },
    ]);
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements).toHaveLength(2);
    for (const statement of statements) {
      expect(statement).toContain('NOT EXISTS');
      expect(statement).toContain('ref_count > 0');
    }

    // 显式排除即将提交的内容键，避免与已计入的预留重复收费。
    await expect(personalPendingRows(manager, 17, [{ sha256: HASH_B, size: 20 }])).resolves.toEqual([
      { sha256: HASH_A, size_bytes: '10' },
    ]);
  });

  it('小队暂存按 squad_id 隔离去重，排除只作用于指定小队', async () => {
    const { manager, query } = managerWith((sql) => {
      if (sql.includes('FROM squad_save_blob_uploads u')) {
        return [
          { squad_id: 'squad-1', sha256: HASH_A, size_bytes: '10' },
          { squad_id: 'squad-1', sha256: HASH_A, size_bytes: '10' },
          { squad_id: 'squad-2', sha256: HASH_A, size_bytes: '10' },
        ];
      }
      return [];
    });

    await expect(ownedSquadPendingRows(manager, 17)).resolves.toEqual([
      { squad_id: 'squad-1', sha256: HASH_A, size_bytes: '10' },
      { squad_id: 'squad-2', sha256: HASH_A, size_bytes: '10' },
    ]);

    await expect(ownedSquadPendingRows(manager, 17, [{ squad_id: 'squad-1', sha256: HASH_A, size: 10 }]))
      .resolves.toEqual([{ squad_id: 'squad-2', sha256: HASH_A, size_bytes: '10' }]);

    const statement = String(query.mock.calls[0][0]);
    expect(statement).toContain('JOIN squads sq ON sq.id = u.squad_id');
    expect(statement).toContain('sq.owner_user_id = ?');
  });

  it('lockBillingUsers 去重、过滤非法 id 并按升序生成锁 SQL', async () => {
    const { manager, query } = managerWith(() => [{ id: 1 }]);

    await lockBillingUsers(manager, [3, 1, 2, 1, 3, 0, -7, 2.5]);

    expect(query).toHaveBeenCalledTimes(1);
    const [statement, parameters] = query.mock.calls[0];
    expect(String(statement)).toContain('SELECT id FROM users WHERE id IN (?,?,?)');
    expect(String(statement)).toContain('ORDER BY id ASC FOR UPDATE');
    expect(parameters).toEqual([1, 2, 3]);
  });

  it('lockBillingUsers 单个 id 也能正常加锁', async () => {
    const { manager, query } = managerWith(() => [{ id: 5 }]);

    await expect(lockBillingUsers(manager, [5])).resolves.toBeUndefined();
    expect(String(query.mock.calls[0][0])).toContain('id IN (?)');
    expect(query.mock.calls[0][1]).toEqual([5]);
  });

  it('lockBillingUsers 没有合法 id 时不发查询', async () => {
    const { manager, query } = managerWith(() => []);

    await lockBillingUsers(manager, [0, -1, 1.5]);

    expect(query).not.toHaveBeenCalled();
  });
});

import { SquadsService } from './squads.service';

const SQUAD_ID = '11111111-1111-4111-8111-111111111111';
const TRANSFER_ID = '33333333-3333-4333-8333-333333333333';
const FUTURE = new Date(Date.now() + 60 * 60 * 1000);

function settingsWith(quota: string) {
  return {
    getCached: jest.fn((key: string) => {
      if (key === 'squad_saves_enabled') return 'true';
      if (key === 'cloud_saves_enabled') return 'true';
      if (key === 'cloud_saves_user_quota_bytes') return quota;
      return null;
    }),
  };
}

function build(managerQuery: jest.Mock, options: { quota?: string; friends?: boolean } = {}) {
  const manager = { query: managerQuery };
  const dataSource = { query: managerQuery, transaction: jest.fn((work: (tx: any) => Promise<unknown>) => work(manager)) };
  const settings = settingsWith(options.quota ?? '2000');
  const friends = { areFriends: jest.fn(async () => options.friends ?? true) };
  const realtime = { emitUser: jest.fn(async () => '1-0') };
  const service = new SquadsService(dataSource as any, settings as any, friends as any, realtime as any);
  return { service, dataSource, manager, settings, friends, realtime };
}

function squadRow(overrides: Record<string, unknown> = {}) {
  return { id: SQUAD_ID, name: 'Squad', owner_user_id: 9, max_members: 8, max_slots: 5, deleted_at: null, ...overrides };
}

function transferManager(transferOverrides: Record<string, unknown> = {}) {
  const transfer = {
    id: TRANSFER_ID,
    squad_id: SQUAD_ID,
    from_user_id: 9,
    to_user_id: 2,
    status: 'pending',
    expires_at: FUTURE,
    created_at: new Date(),
    ...transferOverrides,
  };
  return jest.fn(async (sql: string, parameters: any[] = []) => {
    if (sql.includes('FROM squad_ownership_transfers')) return [transfer];
    if (sql.includes('SELECT id FROM users WHERE id IN')) return parameters.map((id) => ({ id }));
    if (sql.includes('FROM squads')) return [squadRow()];
    if (sql.includes('FROM squad_members WHERE squad_id=? AND user_id=?')) {
      const userId = Number(parameters[1]);
      if (userId === 9) return [{ squad_id: SQUAD_ID, user_id: 9, role: 'owner', status: 'active', joined_at: null }];
      if (userId === 2) return [{ squad_id: SQUAD_ID, user_id: 2, role: 'member', status: 'active', joined_at: null }];
      return [];
    }
    if (sql.includes('FROM squad_save_blobs WHERE squad_id=?')) return [{ size_bytes: '500' }];
    if (sql.includes('FROM squad_save_blob_uploads u') && sql.includes('u.squad_id=?')) {
      return [{ sha256: 'd'.repeat(64), size_bytes: '200' }];
    }
    if (sql.includes('FROM game_save_blobs WHERE user_id=?')) return [{ size_bytes: '100' }];
    if (sql.includes('JOIN squads sq ON sq.id = b.squad_id')) return [{ size_bytes: '300' }];
    if (sql.includes('FROM game_save_upload_sessions s')) return [{ sha256: 'e'.repeat(64), size_bytes: '50' }];
    if (sql.includes('FROM game_save_blob_uploads u')) return [];
    if (sql.includes('FROM squad_save_blob_uploads u') && sql.includes('sq.owner_user_id = ?')) return [];
    if (sql.includes('SELECT user_id FROM squad_members')) return [{ user_id: 2 }, { user_id: 9 }];
    return { affectedRows: 1 };
  });
}

describe('SquadsService 两步队长转让', () => {
  it('接受转让时先按升序锁定新旧队长，再切换归属并广播', async () => {
    const query = transferManager();
    const { service, realtime } = build(query);

    const result = await service.acceptOwnershipTransfer(2, SQUAD_ID, {});

    expect(result).toMatchObject({
      transfer_id: TRANSFER_ID,
      squad_id: SQUAD_ID,
      owner_user_id: 2,
      from_user_id: 9,
      squad_bytes: 700,
      usage_after: { personal_bytes: 100, owned_squads_bytes: 1000, pending_bytes: 50 },
    });

    // D04 死锁防护：双行 users 锁必须按 id 升序，且先于任何归属更新执行。
    const calls = query.mock.calls;
    const lockIndex = calls.findIndex(([sql]) => String(sql).includes('SELECT id FROM users WHERE id IN'));
    const squadUpdateIndex = calls.findIndex(([sql]) => String(sql).includes('UPDATE squads SET owner_user_id'));
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeLessThan(squadUpdateIndex);
    expect(String(calls[lockIndex][0])).toContain('id IN (?,?)');
    expect(String(calls[lockIndex][0])).toContain('ORDER BY id ASC FOR UPDATE');
    expect(calls[lockIndex][1]).toEqual([2, 9]);
    expect(calls.filter(([sql]) => String(sql).includes('SELECT id FROM users WHERE id IN'))).toHaveLength(1);

    expect(calls).toEqual(expect.arrayContaining([
      [expect.stringContaining('UPDATE squads SET owner_user_id=?, updated_at=NOW() WHERE id=?'), [2, SQUAD_ID]],
      [expect.stringContaining('UPDATE squad_save_blobs SET billing_user_id=? WHERE squad_id=?'), [2, SQUAD_ID]],
      [expect.stringContaining('UPDATE squad_save_blob_uploads SET billing_user_id=?'), [2, SQUAD_ID]],
      [expect.stringContaining("UPDATE squad_members SET role='member'"), [SQUAD_ID, 9]],
      [expect.stringContaining("UPDATE squad_members SET role='owner'"), [SQUAD_ID, 2]],
      [expect.stringContaining("UPDATE squad_ownership_transfers SET status='accepted'"), [TRANSFER_ID]],
    ]));
    expect(calls.some(([sql, parameters]) => String(sql).includes('INSERT INTO operation_logs')
      && parameters?.[1] === 'squad.ownership_transfer.accept')).toBe(true);

    expect(realtime.emitUser).toHaveBeenCalledWith(2, 'squad_save.ownership_transferred', expect.objectContaining({
      squad_id: SQUAD_ID, from_user_id: 9, to_user_id: 2, transfer_id: TRANSFER_ID,
    }));
    expect(realtime.emitUser).toHaveBeenCalledWith(9, 'squad_save.ownership_transferred', expect.objectContaining({
      squad_id: SQUAD_ID, to_user_id: 2,
    }));
  });

  it('新队长配额不足时拒绝转让且不执行任何归属更新', async () => {
    const query = transferManager();
    const { service, realtime } = build(query, { quota: '1000' });

    await expect(service.acceptOwnershipTransfer(2, SQUAD_ID, {}))
      .rejects.toMatchObject({ code: 'SQUAD_TRANSFER_QUOTA_EXCEEDED' });

    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes('UPDATE squads SET owner_user_id'))).toBe(false);
    expect(statements.some((sql) => sql.includes('UPDATE squad_save_blobs SET billing_user_id'))).toBe(false);
    expect(statements.some((sql) => sql.includes("UPDATE squad_ownership_transfers SET status='accepted'"))).toBe(false);
    expect(realtime.emitUser).not.toHaveBeenCalled();
  });

  it('转让过期时标记为 expired 并拒绝接受', async () => {
    const query = transferManager({ expires_at: new Date(Date.now() - 1_000) });
    const { service, realtime } = build(query);

    await expect(service.acceptOwnershipTransfer(2, SQUAD_ID, {}))
      .rejects.toMatchObject({ code: 'SQUAD_TRANSFER_EXPIRED' });

    expect(query.mock.calls).toEqual(expect.arrayContaining([
      [expect.stringContaining("UPDATE squad_ownership_transfers SET status='expired'"), [SQUAD_ID]],
    ]));
    expect(query.mock.calls.some(([sql]) => String(sql).includes('SELECT id FROM users WHERE id IN'))).toBe(false);
    expect(realtime.emitUser).not.toHaveBeenCalled();
  });

  it('存在未过期 pending 转让时拒绝重复发起', async () => {
    const query = jest.fn(async (sql: string, parameters: any[] = []) => {
      if (sql.includes('FROM squads')) return [squadRow({ owner_user_id: 1 })];
      if (sql.includes('FROM squad_members WHERE squad_id=? AND user_id=?')) {
        return [{
          squad_id: SQUAD_ID, user_id: Number(parameters[1]),
          role: Number(parameters[1]) === 1 ? 'owner' : 'member', status: 'active', joined_at: null,
        }];
      }
      if (sql.includes('FROM squad_ownership_transfers')) return [{ id: 'old-transfer', expires_at: FUTURE }];
      return { affectedRows: 1 };
    });
    const { service } = build(query);

    await expect(service.createOwnershipTransfer(1, SQUAD_ID, { target_user_id: 2 }, {}))
      .rejects.toMatchObject({ code: 'SQUAD_TRANSFER_PENDING' });

    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO squad_ownership_transfers'))).toBe(false);
  });
});

describe('SquadsService 成员邀请', () => {
  function inviteManager() {
    return jest.fn(async (sql: string, parameters: any[] = []) => {
      if (sql.includes('FROM squads')) return [squadRow({ owner_user_id: 1 })];
      if (sql.includes('SELECT id FROM users WHERE id=? LIMIT 1')) return [{ id: parameters[0] }];
      if (sql.includes('FROM squad_members WHERE squad_id=? AND user_id=?')) {
        return Number(parameters[1]) === 1
          ? [{ squad_id: SQUAD_ID, user_id: 1, role: 'admin', status: 'active', joined_at: new Date() }]
          : [];
      }
      return { affectedRows: 1 };
    });
  }

  it('非好友不能被邀请', async () => {
    const query = inviteManager();
    const { service, dataSource, friends } = build(query, { friends: false });

    await expect(service.inviteMember(1, SQUAD_ID, { user_id: 2 }, {}))
      .rejects.toMatchObject({ code: 'SQUAD_FRIEND_REQUIRED' });

    expect(friends.areFriends).toHaveBeenCalledWith(1, 2);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO squad_members'))).toBe(false);
  });

  it('好友邀请会写入 invited 成员记录', async () => {
    const query = inviteManager();
    const { service } = build(query, { friends: true });

    await expect(service.inviteMember(1, SQUAD_ID, { user_id: 2 }, {}))
      .resolves.toMatchObject({ squad_id: SQUAD_ID, user_id: 2, status: 'invited', already_invited: false });

    const insert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO squad_members'));
    expect(insert).toBeTruthy();
    expect(String(insert![0])).toContain("'invited'");
    expect(insert![1]).toEqual([SQUAD_ID, 2, 1]);
  });

  it('接受邀请时小队满员返回成员上限错误', async () => {
    const query = jest.fn(async (sql: string, parameters: any[] = []) => {
      if (sql.includes('FROM squads')) return [squadRow({ owner_user_id: 1, max_members: 8 })];
      if (sql.includes('FROM squad_members WHERE squad_id=? AND user_id=?')) {
        return [{ squad_id: SQUAD_ID, user_id: 2, role: 'member', status: 'invited', joined_at: null }];
      }
      if (sql.includes('SELECT COUNT(*) AS count FROM squad_members')) return [{ count: '8' }];
      return { affectedRows: 1 };
    });
    const { service } = build(query);

    await expect(service.acceptInvitation(2, SQUAD_ID, {}))
      .rejects.toMatchObject({ code: 'SQUAD_MEMBER_LIMIT_EXCEEDED' });

    expect(query.mock.calls.some(([sql]) => String(sql).includes("UPDATE squad_members SET status='active'"))).toBe(false);
  });
});

describe('SquadsService 删除小队', () => {
  it('软删槽位与快照、吊销租约、递减 blob 引用并标记小队删除', async () => {
    const query = jest.fn(async (sql: string, parameters: any[] = []) => {
      if (sql.includes('FROM squads')) return [squadRow({ owner_user_id: 1 })];
      if (sql.includes('SELECT id FROM squad_save_slots')) return [{ id: 'slot-a' }, { id: 'slot-b' }];
      if (sql.includes('JOIN squad_save_snapshot_files')) {
        return [
          { snapshot_id: 'snap-1', blob_id: 'blob-a' },
          { snapshot_id: 'snap-2', blob_id: 'blob-a' },
          { snapshot_id: 'snap-3', blob_id: 'blob-b' },
        ];
      }
      if (sql.includes('SELECT ref_count FROM squad_save_blobs')) {
        return [{ ref_count: parameters[0] === 'blob-a' ? 5 : 1 }];
      }
      return { affectedRows: 1 };
    });
    const { service } = build(query);

    await expect(service.deleteSquad(1, SQUAD_ID, {})).resolves.toEqual({ id: SQUAD_ID, deleted: true });

    const calls = query.mock.calls;
    expect(calls).toEqual(expect.arrayContaining([
      [expect.stringContaining('UPDATE squad_save_blobs SET ref_count=?,pending_delete_at=?,gc_in_progress=0 WHERE id=?'), [3, null, 'blob-a']],
      [expect.stringContaining('UPDATE squad_save_blobs SET ref_count=?,pending_delete_at=?,gc_in_progress=0 WHERE id=?'), [0, expect.any(Date), 'blob-b']],
    ]));

    const deletedFiles = calls
      .filter(([sql]) => String(sql).includes('DELETE FROM squad_save_snapshot_files'))
      .map(([, parameters]) => parameters[0]);
    expect(deletedFiles).toEqual(['snap-1', 'snap-2', 'snap-3']);

    expect(calls.some(([sql]) => String(sql).includes('UPDATE squad_save_snapshots SET deleted_at=NOW()'))).toBe(true);
    expect(calls.some(([sql]) => String(sql).includes('UPDATE squad_save_slots SET head_snapshot_id=NULL'))).toBe(true);
    expect(calls.some(([sql, parameters]) => String(sql).includes("UPDATE squad_save_leases SET status='expired'")
      && parameters?.length === 2)).toBe(true);
    expect(calls.some(([sql, parameters]) => String(sql).includes("UPDATE squad_save_blob_uploads SET status='expired'")
      && parameters?.[0] === SQUAD_ID)).toBe(true);
    expect(calls.some(([sql, parameters]) => String(sql).includes('UPDATE squads SET deleted_at=NOW()')
      && parameters?.[0] === SQUAD_ID)).toBe(true);
    expect(calls.some(([sql, parameters]) => String(sql).includes("UPDATE squad_members SET status='left'")
      && parameters?.[0] === SQUAD_ID)).toBe(true);
    expect(calls.some(([sql, parameters]) => String(sql).includes("UPDATE squad_ownership_transfers SET status='cancelled'")
      && parameters?.[0] === SQUAD_ID)).toBe(true);
    expect(calls.some(([sql, parameters]) => String(sql).includes('INSERT INTO operation_logs')
      && parameters?.[1] === 'squad.delete')).toBe(true);
  });
});

describe('SquadsService 权限校验', () => {
  it('普通成员不能发起队长转让', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM squads')) return [squadRow({ owner_user_id: 1 })];
      return { affectedRows: 1 };
    });
    const { service } = build(query);

    await expect(service.createOwnershipTransfer(2, SQUAD_ID, { target_user_id: 3 }, {}))
      .rejects.toMatchObject({ code: 'SQUAD_PERMISSION_DENIED' });

    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO squad_ownership_transfers'))).toBe(false);
  });

  it('普通成员不能移除他人', async () => {
    const query = jest.fn(async (sql: string, parameters: any[] = []) => {
      if (sql.includes('FROM squads')) return [squadRow({ owner_user_id: 9 })];
      if (sql.includes('FROM squad_members WHERE squad_id=? AND user_id=?')) {
        return [{ squad_id: SQUAD_ID, user_id: Number(parameters[1]), role: 'member', status: 'active', joined_at: null }];
      }
      return { affectedRows: 1 };
    });
    const { service } = build(query);

    await expect(service.removeMember(2, SQUAD_ID, 3, {}))
      .rejects.toMatchObject({ code: 'SQUAD_PERMISSION_DENIED' });

    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE squad_members SET status='))).toBe(false);
  });
});

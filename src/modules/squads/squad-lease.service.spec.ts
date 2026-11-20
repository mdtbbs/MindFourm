import { SquadLeaseService } from './squad-lease.service';

const SQUAD_ID = '11111111-1111-4111-8111-111111111111';
const SLOT_ID = '22222222-2222-4222-8222-222222222222';

type LeaseState = {
  leaseReads: number;
  leaseRows: any[] | ((read: number) => any[]);
  memberRole: string;
  memberIds: number[];
  slot: Record<string, unknown>;
};

function leaseRow(overrides: Record<string, unknown> = {}) {
  return {
    slot_id: SLOT_ID,
    lease_id: 'lease-prev',
    holder_user_id: 7,
    holder_client_id: 'client-7',
    multiplayer_session_id: 'sess-7',
    fencing_token: '3',
    previous_holder_user_id: null,
    previous_fencing_token: null,
    status: 'active',
    acquired_at: new Date(Date.now() - 60_000),
    last_heartbeat_at: new Date(Date.now() - 10_000),
    expires_at: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function queryHandler(state: LeaseState) {
  return async (sql: string, parameters: any[] = []) => {
    if (sql.includes('FROM squads')) {
      return [{ id: SQUAD_ID, name: 'Squad', owner_user_id: 1, max_members: 8, max_slots: 5, deleted_at: null }];
    }
    if (sql.includes('FROM squad_members WHERE squad_id=? AND user_id=?')) {
      return [{
        squad_id: SQUAD_ID,
        user_id: Number(parameters[1]),
        role: state.memberRole,
        status: 'active',
        joined_at: null,
      }];
    }
    if (sql.includes('SELECT * FROM squad_save_slots WHERE id=')) {
      return [state.slot];
    }
    if (sql.includes('SELECT * FROM squad_save_leases')) {
      state.leaseReads += 1;
      return typeof state.leaseRows === 'function' ? state.leaseRows(state.leaseReads) : state.leaseRows;
    }
    if (sql.includes('SELECT user_id FROM squad_members')) {
      return state.memberIds.map((userId) => ({ user_id: userId }));
    }
    return { affectedRows: 1 };
  };
}

function buildLeaseService(overrides: Partial<LeaseState> & Pick<LeaseState, 'leaseRows'>) {
  const state: LeaseState = {
    leaseReads: 0,
    memberRole: 'member',
    memberIds: [2, 7],
    slot: {
      id: SLOT_ID,
      squad_id: SQUAD_ID,
      name: 'Slot',
      head_snapshot_id: null,
      active_session_id: null,
      lanlink_room_code: 'ROOM-42',
      game_version: null,
      mods_json: null,
      created_by_user_id: 1,
      deleted_at: null,
    },
    ...overrides,
  };
  const query = jest.fn(queryHandler(state));
  const manager = { query };
  const dataSource = { transaction: jest.fn((work: (tx: any) => Promise<unknown>) => work(manager)) };
  const realtime = { emitUser: jest.fn(async () => '1-0') };
  const settings = {
    getCached: jest.fn((key: string) =>
      key === 'squad_saves_enabled' || key === 'cloud_saves_enabled' ? 'true' : undefined),
  };
  const service = new SquadLeaseService(dataSource as any, realtime as any, settings as any);
  return { service, manager, query, dataSource, realtime, settings, state };
}

describe('SquadLeaseService 抢占与续期', () => {
  it('并发抢租约时只有首个请求成功，第二个请求返回当前持有者信息', async () => {
    // 第一次 SELECT 返回空（无记录，可插入），第二次返回已激活的持有行。
    const { service, query, realtime } = buildLeaseService({
      leaseRows: (read) => read === 1 ? [] : [leaseRow()],
    });

    const first = await service.acquire(2, 'client-2', SQUAD_ID, SLOT_ID, {});
    expect(first).toMatchObject({ taken_over: false, previous_holder_user_id: null, previous_lease_id: null });
    expect(first.lease).toMatchObject({ holder_user_id: 2, fencing_token: 1, status: 'active', multiplayer_session_id: null });

    const insert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO squad_save_leases'));
    expect(insert).toBeTruthy();
    expect(insert![1][4]).toBe(1);
    expect(realtime.emitUser).toHaveBeenCalledWith(2, 'squad_save.lease_acquired',
      expect.objectContaining({ slot_id: SLOT_ID, fencing_token: 1 }));

    await expect(service.acquire(2, 'client-2', SQUAD_ID, SLOT_ID, {})).rejects.toMatchObject({
      code: 'SQUAD_SAVE_LEASE_HELD',
      details: [expect.objectContaining({
        holder_user_id: 7,
        fencing_token: 3,
        multiplayer_session_id: 'sess-7',
        lanlink_room_code: 'ROOM-42',
      })],
    });
  });

  it('租约自然过期后任意活跃成员可以接力，fencing_token 单调递增', async () => {
    const { service, query } = buildLeaseService({
      leaseRows: [leaseRow({ expires_at: new Date(Date.now() - 1_000), fencing_token: '6' })],
    });

    const result = await service.acquire(2, 'client-2', SQUAD_ID, SLOT_ID, {});

    expect(result.taken_over).toBe(false);
    expect(result.previous_holder_user_id).toBeNull();
    expect(result.lease.fencing_token).toBe(7);
    const update = query.mock.calls.find(([sql]) => String(sql).includes('UPDATE squad_save_leases'));
    expect(update).toBeTruthy();
    expect(String(update![0])).toContain("status='active'");
    expect(update![1][1]).toBe(2);
    expect(update![1][3]).toBe(7);
  });

  it('普通成员不能强制接管未过期租约', async () => {
    const { service } = buildLeaseService({ memberRole: 'member', leaseRows: [leaseRow()] });

    await expect(service.acquire(2, 'client-2', SQUAD_ID, SLOT_ID, { force_takeover: true }))
      .rejects.toMatchObject({ code: 'SQUAD_TAKEOVER_FORBIDDEN' });
  });

  it('队长强制接管会递增 token、返回原持有者并广播接管事件', async () => {
    const { service, query, realtime } = buildLeaseService({ memberRole: 'owner', leaseRows: [leaseRow()] });

    const result = await service.acquire(2, 'client-2', SQUAD_ID, SLOT_ID, { force_takeover: true });

    expect(result).toMatchObject({
      taken_over: true,
      previous_holder_user_id: 7,
      previous_lease_id: 'lease-prev',
      lease: { holder_user_id: 2, fencing_token: 4, status: 'active' },
    });
    const update = query.mock.calls.find(([sql]) => String(sql).includes('UPDATE squad_save_leases'));
    expect(update![1][3]).toBe(4);
    expect(realtime.emitUser).toHaveBeenCalledWith(2, 'squad_save.lease_taken_over',
      expect.objectContaining({ holder_user_id: 2, previous_holder_user_id: 7, fencing_token: 4 }));
    expect(realtime.emitUser).toHaveBeenCalledWith(7, 'squad_save.lease_taken_over',
      expect.objectContaining({ previous_holder_user_id: 7 }));
  });

  it('fencing_token 不匹配时续期返回 stale', async () => {
    const { service } = buildLeaseService({ leaseRows: [leaseRow({ holder_user_id: 2 })] });

    await expect(service.renew(2, 'client-2', SQUAD_ID, SLOT_ID, { fencing_token: 2 }))
      .rejects.toMatchObject({ code: 'SQUAD_SAVE_LEASE_STALE' });
  });

  it('非当前持有者续期返回 stale', async () => {
    const { service } = buildLeaseService({ leaseRows: [leaseRow({ holder_user_id: 7 })] });

    await expect(service.renew(2, 'client-2', SQUAD_ID, SLOT_ID, { fencing_token: 3 }))
      .rejects.toMatchObject({ code: 'SQUAD_SAVE_LEASE_STALE' });
  });

  it('持有者续期会刷新过期时间并返回 90 秒心跳间隔', async () => {
    const { service, query } = buildLeaseService({ leaseRows: [leaseRow({ holder_user_id: 2 })] });

    const result = await service.renew(2, 'client-2', SQUAD_ID, SLOT_ID, { fencing_token: 3 });

    expect(result).toMatchObject({
      slot_id: SLOT_ID,
      lease_id: 'lease-prev',
      fencing_token: 3,
      heartbeat_interval_seconds: 90,
    });
    expect(result.expires_at.getTime()).toBeGreaterThan(Date.now() + 100_000);
    const update = query.mock.calls.find(([sql]) => String(sql)
      .includes('UPDATE squad_save_leases SET last_heartbeat_at=?, expires_at=?, holder_client_id=? WHERE slot_id=?'));
    expect(update).toBeTruthy();
    expect(update![1][2]).toBe('client-2');
    expect(update![1][3]).toBe(SLOT_ID);
  });
});

describe('SquadLeaseService 释放与绑定', () => {
  it('非持有者释放租约返回 stale', async () => {
    const { service } = buildLeaseService({ leaseRows: [leaseRow({ holder_user_id: 7 })] });

    await expect(service.release(2, SQUAD_ID, SLOT_ID, 3))
      .rejects.toMatchObject({ code: 'SQUAD_SAVE_LEASE_STALE' });
  });

  it('持有者释放租约会把状态置为 released 并广播', async () => {
    const { service, query, realtime } = buildLeaseService({ leaseRows: [leaseRow({ holder_user_id: 2 })] });

    await expect(service.release(2, SQUAD_ID, SLOT_ID, 3))
      .resolves.toEqual({ slot_id: SLOT_ID, lease_id: 'lease-prev', released: true });

    const update = query.mock.calls.find(([sql]) => String(sql).includes("UPDATE squad_save_leases SET status='released'"));
    expect(update).toBeTruthy();
    expect(update![1]).toEqual([SLOT_ID]);
    expect(realtime.emitUser).toHaveBeenCalledWith(2, 'squad_save.lease_released',
      expect.objectContaining({ slot_id: SLOT_ID, holder_user_id: 2, fencing_token: 3 }));
  });

  it('绑定多人联机会话会同时回填租约与槽位的 active_session_id', async () => {
    const { service, manager } = buildLeaseService({ leaseRows: [leaseRow()] });

    await service.bindMultiplayerSession(manager as any, 7, {
      squad_id: SQUAD_ID,
      slot_id: SLOT_ID,
      fencing_token: 3,
      lanlink_room_code: 'ROOM-9',
    }, 'session-9');

    expect(manager.query.mock.calls).toEqual(expect.arrayContaining([
      [expect.stringContaining('UPDATE squad_save_leases SET multiplayer_session_id=? WHERE slot_id=?'), ['session-9', SLOT_ID]],
      [expect.stringContaining('UPDATE squad_save_slots SET active_session_id=?, lanlink_room_code=COALESCE(?, lanlink_room_code), updated_at=NOW() WHERE id=?'),
        ['session-9', 'ROOM-9', SLOT_ID]],
    ]));

    const slotLock = manager.query.mock.calls.findIndex(([sql]) =>
      String(sql).includes('FROM squad_save_slots WHERE id=?') && String(sql).includes('FOR UPDATE'));
    const leaseLock = manager.query.mock.calls.findIndex(([sql]) => String(sql).includes('SELECT * FROM squad_save_leases'));
    expect(slotLock).toBeGreaterThanOrEqual(0);
    expect(slotLock).toBeLessThan(leaseLock);
  });

  it('没有租约时 assertHeld 要求先获取写租约', async () => {
    const { service, manager } = buildLeaseService({ leaseRows: [] });

    await expect(service.assertHeld(manager as any, SLOT_ID, 2))
      .rejects.toMatchObject({ code: 'SQUAD_SAVE_LEASE_REQUIRED' });
  });
});

describe('SquadLeaseService 冲突救援授权', () => {
  it('最近一次被接管的原持有者可用自己的旧 token 保存冲突分支', async () => {
    const { service, manager } = buildLeaseService({
      leaseRows: [leaseRow({ holder_user_id: 7, fencing_token: '3', previous_holder_user_id: 2, previous_fencing_token: '2' })],
    });

    await expect(service.assertSupersededFencing(manager as any, SQUAD_ID, SLOT_ID, 2, 2))
      .resolves.toMatchObject({ lease_id: 'lease-prev', holder_user_id: 7, fencing_token: '3' });
  });

  it('当前 token 或更大的 token 且 holder 不是调用者时返回 stale', async () => {
    const { service, manager } = buildLeaseService({ leaseRows: [leaseRow({ holder_user_id: 7, fencing_token: '3' })] });

    await expect(service.assertSupersededFencing(manager as any, SQUAD_ID, SLOT_ID, 2, 3))
      .rejects.toMatchObject({ code: 'SQUAD_SAVE_LEASE_STALE' });
    await expect(service.assertSupersededFencing(manager as any, SQUAD_ID, SLOT_ID, 2, 4))
      .rejects.toMatchObject({ code: 'SQUAD_SAVE_LEASE_STALE' });
  });

  it('没有租约历史的其他成员不能用很小的 token 写入冲突分支', async () => {
    const { service, manager } = buildLeaseService({
      leaseRows: [leaseRow({ holder_user_id: 7, fencing_token: '3', previous_holder_user_id: 2, previous_fencing_token: '2' })],
    });

    await expect(service.assertSupersededFencing(manager as any, SQUAD_ID, SLOT_ID, 9, 1))
      .rejects.toMatchObject({ code: 'SQUAD_SAVE_LEASE_STALE' });
  });

  it('从未建立租约记录时返回 stale', async () => {
    const { service, manager } = buildLeaseService({ leaseRows: [] });

    await expect(service.assertSupersededFencing(manager as any, SQUAD_ID, SLOT_ID, 2, 2))
      .rejects.toMatchObject({ code: 'SQUAD_SAVE_LEASE_STALE' });
  });
});

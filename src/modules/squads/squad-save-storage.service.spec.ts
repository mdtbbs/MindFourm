import { HttpStatus } from '@nestjs/common';
import { ApiV1Exception } from '@common/exceptions/api-v1.exception';
import { SquadSaveStorageService } from './squad-save-storage.service';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const FENCING = 3;

type QueryCall = [string, unknown[]];

/**
 * 有状态 SQL mock：按语句子串路由，返回与真实 MySQL 行形状一致的数组。
 *
 * 未命中的语句默认返回 `[]`；UPDATE / INSERT 需要读 `affectedRows` 的
 * 分支单独给出返回值。
 */
function makeFixture(overrides: Record<string, unknown> = {}) {
  return {
    squad: {
      id: 'squad-1', name: 'Squad', owner_user_id: 5, max_members: 10, max_slots: 5, deleted_at: null,
    },
    member: { squad_id: 'squad-1', user_id: 7, role: 'member', status: 'active', joined_at: null },
    memberIds: [5, 7],
    slot: {
      id: 'slot-1', squad_id: 'squad-1', name: 'Slot', head_snapshot_id: null, active_session_id: null,
      lanlink_room_code: null, game_version: null, mods_json: null, created_by_user_id: 5, deleted_at: null,
    },
    head: null,
    blobs: () => [] as any[],
    uploads: () => [] as any[],
    quota: { personal: 0, squads: 0, personalPending: [] as any[], squadPending: [] as any[] },
    revision: 2,
    sourceSnapshot: null,
    sourceFiles: [] as any[],
    finalSnapshot: null,
    pinRow: null,
    pinCount: 0,
    recent: [] as any[],
    daily: [] as any[],
    dailyRows: [] as any[],
    candidates: [] as any[],
    filesBySnapshot: {} as Record<string, any[]>,
    refCounts: {} as Record<string, number>,
    squadBlobHashes: [] as any[],
    squadUploadHashes: [] as any[],
    lockedOwner: undefined as number | undefined,
    uploadSession: null as any,
    uploadLease: null as any,
    ...overrides,
  };
}

function createHarness(fixture: ReturnType<typeof makeFixture>, leaseOverride?: any) {
  const calls: QueryCall[] = [];
  const insertedSnapshotParams: unknown[][] = [];
  const fileInsertParams: unknown[][] = [];
  let insertedSnapshotId: string | null = null;

  const route = (sql: string, parameters: unknown[] = []): any => {
    // ---- 小队上下文 -------------------------------------------------------
    if (sql.includes('SELECT id,name,owner_user_id,max_members,max_slots,deleted_at FROM squads')) {
      return [fixture.squad];
    }
    if (sql.includes('SELECT squad_id,user_id,role,status,joined_at FROM squad_members')) {
      return [fixture.member];
    }
    if (sql.includes("SELECT user_id FROM squad_members WHERE squad_id=? AND status='active'")) {
      return fixture.memberIds.map((user_id) => ({ user_id }));
    }
    if (sql.includes('FROM squad_save_slots WHERE id=? AND squad_id=?')) {
      return [fixture.slot];
    }
    if (sql.includes('SELECT id FROM users WHERE id=? FOR UPDATE')) {
      return [{ id: fixture.squad.owner_user_id }];
    }
    // 存储路径先锁计费用户，再锁小队并确认 owner 未在转让中变化。
    if (sql.includes('SELECT owner_user_id FROM squads WHERE id=? AND deleted_at IS NULL FOR UPDATE')) {
      return [{ owner_user_id: fixture.lockedOwner ?? fixture.squad.owner_user_id }];
    }

    if (sql.includes('SELECT * FROM squad_save_blob_uploads WHERE id=? AND squad_id=? AND uploader_user_id=?')) {
      return fixture.uploadSession ? [fixture.uploadSession] : [];
    }
    if (sql.includes('SELECT holder_user_id,status,expires_at FROM squad_save_leases WHERE lease_id=?')) {
      return fixture.uploadLease ? [fixture.uploadLease] : [];
    }

    // ---- checkBlobs（物理隔离断言依赖这两个来源）--------------------------
    if (sql.includes('SELECT DISTINCT sha256 FROM squad_save_blobs')) return fixture.squadBlobHashes;
    if (sql.includes('SELECT DISTINCT sha256 FROM squad_save_blob_uploads')) return fixture.squadUploadHashes;

    // ---- 统一配额（getSaveQuotaUsage 的五条顺序查询）----------------------
    if (sql.includes('u.squad_id AS squad_id')) return fixture.quota.squadPending;
    if (sql.includes('FROM squad_save_blobs b JOIN squads sq')) return [{ size_bytes: String(fixture.quota.squads) }];
    if (sql.includes('FROM game_save_blobs WHERE user_id=? AND ref_count>0')) {
      return [{ size_bytes: String(fixture.quota.personal) }];
    }
    if (sql.includes('FROM game_save_upload_sessions s')) return fixture.quota.personalPending;
    if (sql.includes('FROM game_save_blob_uploads u')) return [];

    // ---- 清单文件解析 -----------------------------------------------------
    if (sql.includes('SELECT id,ref_count,gc_in_progress,object_key FROM squad_save_blobs WHERE squad_id=?')) {
      return fixture.blobs(parameters);
    }
    if (sql.includes('SELECT id,object_key FROM squad_save_blob_uploads')) {
      return fixture.uploads(parameters);
    }
    if (sql.includes('INSERT INTO squad_save_blobs ')) return { affectedRows: 1 };
    if (sql.includes("UPDATE squad_save_blob_uploads SET status='committed'")) return { affectedRows: 1 };

    // ---- 快照提交 ---------------------------------------------------------
    if (sql.includes('SELECT COALESCE(MAX(revision),0)+1 AS revision')) return [{ revision: fixture.revision }];
    if (sql.includes('INSERT INTO squad_save_snapshots')) {
      insertedSnapshotId = String(parameters[0]);
      insertedSnapshotParams.push(parameters);
      return { affectedRows: 1 };
    }
    if (sql.includes('INSERT INTO squad_save_snapshot_files')) {
      fileInsertParams.push(parameters);
      return { affectedRows: 1 };
    }
    if (sql.includes('SELECT id,gc_in_progress FROM squad_save_blobs WHERE id=? FOR UPDATE')) {
      return [{ id: parameters[0], gc_in_progress: 0 }];
    }
    if (sql.includes('UPDATE squad_save_blobs SET ref_count=ref_count+1')) return { affectedRows: 1 };
    if (sql.includes('UPDATE squad_save_slots SET head_snapshot_id=?')) return { affectedRows: 1 };

    // ---- GFS 裁剪 ---------------------------------------------------------
    if (sql.includes('ORDER BY revision DESC LIMIT 10')) return fixture.recent;
    if (sql.includes('SELECT MAX(revision) AS revision')) return fixture.daily;
    if (sql.includes('AND revision IN (')) return fixture.dailyRows;
    if (sql.includes("SET retention_tier='daily'")) return { affectedRows: 1 };
    if (sql.includes("SET retention_tier='recent'")) return { affectedRows: 1 };
    if (sql.includes('SELECT id FROM squad_save_snapshots')
      && sql.includes("branch_type='main' AND pinned=0")) return fixture.candidates;
    if (sql.includes('SELECT DISTINCT blob_id FROM squad_save_snapshot_files')) {
      return fixture.filesBySnapshot[String(parameters[0])] || [];
    }
    if (sql.includes('UPDATE squad_save_snapshots SET deleted_at=NOW() WHERE id=? AND deleted_at IS NULL')) {
      return { affectedRows: 1 };
    }
    if (sql.includes('SELECT ref_count FROM squad_save_blobs WHERE id=? FOR UPDATE')) {
      return [{ ref_count: fixture.refCounts[String(parameters[0])] ?? 1 }];
    }
    if (sql.includes('UPDATE squad_save_blobs SET ref_count=?,pending_delete_at=?')) return { affectedRows: 1 };
    if (sql.includes('DELETE FROM squad_save_snapshot_files WHERE snapshot_id=?')) return { affectedRows: 1 };
    if (sql.includes('INSERT INTO operation_logs')) return { affectedRows: 1 };

    // ---- 读取 / 恢复 ------------------------------------------------------
    if (sql.includes('SELECT * FROM squad_save_snapshots WHERE id=? AND deleted_at IS NULL LIMIT 1')) {
      return fixture.head ? [fixture.head] : [];
    }
    if (sql.includes('SELECT id FROM squad_save_snapshots WHERE id=? AND slot_id=? AND deleted_at IS NULL LIMIT 1')) {
      return [{ id: parameters[0] }];
    }
    if (sql.includes('SELECT * FROM squad_save_snapshots WHERE id=? AND slot_id=? AND deleted_at IS NULL LIMIT 1')) {
      return fixture.sourceSnapshot ? [fixture.sourceSnapshot] : [];
    }
    if (sql.includes('SELECT file_path,size_bytes,sha256,blob_id FROM squad_save_snapshot_files')) {
      return fixture.sourceFiles;
    }
    if (sql.includes('SELECT * FROM squad_save_snapshots WHERE id=? LIMIT 1')) {
      return fixture.finalSnapshot ? [{ ...fixture.finalSnapshot, id: insertedSnapshotId }] : [];
    }

    // ---- 置顶 -------------------------------------------------------------
    if (sql.includes('SELECT id,branch_type,pinned FROM squad_save_snapshots')) return fixture.pinRow ? [fixture.pinRow] : [];
    if (sql.includes('SELECT COUNT(*) AS count FROM squad_save_snapshots')) return [{ count: fixture.pinCount }];
    if (sql.includes('UPDATE squad_save_snapshots SET pinned=?')) return { affectedRows: 1 };

    return [];
  };

  const manager = {
    query: jest.fn(async (sql: string, parameters: unknown[] = []) => {
      calls.push([sql, parameters]);
      return route(sql, parameters);
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (work: (tx: any) => Promise<unknown>) => work(manager)),
    query: jest.fn(async (sql: string, parameters: unknown[] = []) => {
      calls.push([sql, parameters]);
      return route(sql, parameters);
    }),
    manager: {
      query: jest.fn(async (sql: string, parameters: unknown[] = []) => {
        calls.push([sql, parameters]);
        return route(sql, parameters);
      }),
    },
  };
  const settings = {
    getCached: jest.fn((key: string) => ({
      squad_saves_enabled: 'true',
      cloud_saves_enabled: 'true',
      cloud_saves_user_quota_bytes: '1000',
      cloud_saves_max_file_bytes: '100',
    } as Record<string, string>)[key]),
  };
  const storage = {
    provider: 'local',
    isConfigured: () => true,
    statObject: jest.fn(async () => ({ exists: true, size_bytes: 10 })),
    openObject: jest.fn(),
    writeObject: jest.fn(),
    deleteObject: jest.fn(),
  };
  const config = { get: jest.fn(() => undefined) };
  const lease = leaseOverride || {
    assertFencing: jest.fn(async () => ({ status: 'active', holder_user_id: 7, fencing_token: String(FENCING) })),
    assertSupersededFencing: jest.fn(async () => ({ status: 'active', holder_user_id: 5, fencing_token: String(FENCING) })),
    assertHeld: jest.fn(async () => ({ lease_id: 'lease-1' })),
  };
  const realtime = { emitUser: jest.fn(async () => undefined) };

  const service = new SquadSaveStorageService(
    dataSource as any, config as any, settings as any, storage as any, lease as any, realtime as any,
  );

  return {
    service, calls, manager, dataSource, settings, storage, lease, realtime,
    insertedSnapshotParams, fileInsertParams,
    insertedSnapshotId: () => insertedSnapshotId,
  };
}

function manifestBody(overrides: Record<string, unknown> = {}) {
  return {
    manifest: { files: [{ path: 'saves/0.msav', size: 10, sha256: HASH_A }] },
    fencing_token: FENCING,
    ...overrides,
  };
}

const existingBlob = () => [{ id: 'blob-a', ref_count: 1, gc_in_progress: 0, object_key: 'cloud-saves/5/a' }];

describe('SquadSaveStorageService commit', () => {
  it('main chain commit writes the snapshot, advances head, references blobs and broadcasts', async () => {
    const harness = createHarness(makeFixture({ blobs: existingBlob }));

    const result = await harness.service.commitSnapshot(7, 'squad-1', 'slot-1', manifestBody(), {});

    expect(result.branch_type).toBe('main');
    expect(result.is_head).toBe(true);

    const insert = harness.insertedSnapshotParams[0];
    expect(insert[1]).toBe('slot-1');
    expect(insert[2]).toBe('squad-1');
    expect(insert[7]).toBe('main');
    expect(insert[8]).toBe('recent');
    expect(insert[11]).toMatch(/^[a-f0-9]{64}$/);
    expect(insert[12]).toBe('10');

    const headUpdate = harness.calls.find(([sql]) => sql.includes('UPDATE squad_save_slots SET head_snapshot_id=?'));
    expect(headUpdate?.[1][0]).toBe(result.id);
    expect(headUpdate?.[1][4]).toBe('slot-1');

    expect(harness.fileInsertParams[0]).toEqual(expect.arrayContaining(['saves/0.msav', 'blob-a', '10', HASH_A]));
    expect(harness.calls.some(([sql, parameters]) =>
      sql.includes('UPDATE squad_save_blobs SET ref_count=ref_count+1')
      && (parameters as unknown[]).includes('blob-a'))).toBe(true);

    expect(harness.realtime.emitUser).toHaveBeenCalledWith(5, 'squad_save.snapshot_committed', expect.objectContaining({
      squad_id: 'squad-1', slot_id: 'slot-1', snapshot_id: result.id, branch_type: 'main',
      head_snapshot_id: result.id,
    }));
    expect(harness.realtime.emitUser).toHaveBeenCalledWith(7, 'squad_save.snapshot_committed', expect.anything());
  });

  it('rejects a stale fencing token before inserting anything', async () => {
    const lease = {
      assertFencing: jest.fn(async () => {
        throw new ApiV1Exception('SQUAD_SAVE_LEASE_STALE', HttpStatus.CONFLICT, 'stale');
      }),
      assertHeld: jest.fn(),
    };
    const harness = createHarness(makeFixture({ blobs: existingBlob }), lease);

    await expect(harness.service.commitSnapshot(7, 'squad-1', 'slot-1', manifestBody({ fencing_token: 1 }), {}))
      .rejects.toMatchObject({ code: 'SQUAD_SAVE_LEASE_STALE' });

    expect(lease.assertFencing).toHaveBeenCalledWith(expect.anything(), 'squad-1', 'slot-1', 7, 1);
    expect(harness.calls.some(([sql]) => sql.includes('INSERT INTO squad_save_snapshots'))).toBe(false);
    expect(harness.calls.some(([sql]) => sql.includes('UPDATE squad_save_slots SET head_snapshot_id=?'))).toBe(false);
  });

  it('stores conflict_rescue as an isolated conflict branch without fencing or head movement', async () => {
    const lease = {
      assertFencing: jest.fn(async () => { throw new Error('conflict_rescue must not require current fencing'); }),
      assertSupersededFencing: jest.fn(async () => ({ status: 'active', holder_user_id: 5, fencing_token: '2' })),
      assertHeld: jest.fn(),
    };
    const harness = createHarness(makeFixture({
      blobs: existingBlob,
      slot: {
        id: 'slot-1', squad_id: 'squad-1', name: 'Slot', head_snapshot_id: 'head-1', active_session_id: null,
        lanlink_room_code: null, game_version: null, mods_json: null, created_by_user_id: 5, deleted_at: null,
      },
      head: {
        id: 'head-1', slot_id: 'slot-1', squad_id: 'squad-1', revision: 2, parent_snapshot_id: null,
        uploader_user_id: 5, fencing_token: '2', branch_type: 'main', retention_tier: 'recent', format: 'manifest_v1',
        manifest_file_count: 1, sha256: 'f'.repeat(64), size_bytes: '10', game_version: null, game_build: null,
        map_name: null, wave: null, playtime_seconds: null, reason: 'manual', pinned: 0, created_at: new Date(),
        deleted_at: null,
      },
    }), lease);

    const result = await harness.service.commitSnapshot(7, 'squad-1', 'slot-1',
      manifestBody({ mode: 'conflict_rescue' }), {});

    expect(lease.assertFencing).not.toHaveBeenCalled();
    expect(lease.assertSupersededFencing).toHaveBeenCalledWith(expect.anything(), 'squad-1', 'slot-1', 7, FENCING);
    expect(result.branch_type).toBe('conflict');
    expect(result.is_head).toBe(false);

    const insert = harness.insertedSnapshotParams[0];
    expect(insert[7]).toBe('conflict');
    expect(insert[8]).toBe('conflict');
    // mods_manifest_json / mods_manifest_hash 在 reason 之前，reason 因此后移两位。
    expect(insert[20]).toBe('conflict');
    expect(harness.calls.some(([sql]) => sql.includes('UPDATE squad_save_slots SET head_snapshot_id=?'))).toBe(false);
    expect(harness.realtime.emitUser).toHaveBeenCalledWith(5, 'squad_save.snapshot_committed', expect.objectContaining({
      branch_type: 'conflict', head_snapshot_id: null,
    }));
  });
});

describe('SquadSaveStorageService blob isolation', () => {
  it('only consults squad blob tables when checking hashes for a squad', async () => {
    const harness = createHarness(makeFixture({
      squadBlobHashes: [{ sha256: HASH_A }],
      squadUploadHashes: [{ sha256: HASH_B }],
    }));

    await expect(harness.service.checkBlobs(7, 'squad-1', 'slot-1', { sha256: [HASH_A, HASH_B, HASH_C] }))
      .resolves.toEqual({ exists: [HASH_A, HASH_B], missing: [HASH_C] });

    const sqls = harness.calls.map(([sql]) => sql);
    expect(sqls.every((sql) => !sql.includes('game_save_blobs'))).toBe(true);
    expect(sqls.some((sql) => sql.includes('FROM squad_save_blobs'))).toBe(true);
    expect(sqls.some((sql) => sql.includes('FROM squad_save_blob_uploads'))).toBe(true);
  });
});

describe('SquadSaveStorageService owner quota', () => {
  function quotaFixture(ownerUserId: number) {
    return makeFixture({
      squad: { id: 'squad-1', name: 'Squad', owner_user_id: ownerUserId, max_members: 10, max_slots: 5, deleted_at: null },
      member: { squad_id: 'squad-1', user_id: 7, role: 'member', status: 'active', joined_at: null },
      quota: {
        personal: 400,
        squads: 500,
        personalPending: [{ sha256: HASH_B, size_bytes: '60' }],
        squadPending: [{ squad_id: 'squad-1', sha256: HASH_C, size_bytes: '35' }],
      },
      blobs: () => [],
      uploads: () => [{ id: 'upload-1', object_key: 'cloud-saves/5/upload', storage_provider: 'local' }],
    });
  }

  it('hides the owner usage breakdown from non-owner members', async () => {
    const harness = createHarness(quotaFixture(5));

    await expect(harness.service.commitSnapshot(7, 'squad-1', 'slot-1', manifestBody(), {}))
      .rejects.toMatchObject({ code: 'SQUAD_OWNER_QUOTA_EXCEEDED', details: [] });
    expect(harness.calls.some(([sql]) => sql.includes('INSERT INTO squad_save_snapshots'))).toBe(false);
  });

  it('shows the owner usage breakdown to the squad owner', async () => {
    const harness = createHarness(quotaFixture(5));

    await expect(harness.service.commitSnapshot(5, 'squad-1', 'slot-1', manifestBody(), {}))
      .rejects.toMatchObject({
        code: 'SQUAD_OWNER_QUOTA_EXCEEDED',
        details: [{ used_bytes: 995, limit_bytes: 1000, required_bytes: 1005 }],
      });
  });
});

describe('SquadSaveStorageService GFS retention', () => {
  it('keeps the recent 10, the daily last snapshot, pinned and conflict branches', async () => {
    const mains = Array.from({ length: 15 }, (_, index) => `snap-${String(index + 1).padStart(2, '0')}`);
    const recent = mains.slice(5).map((id) => ({ id })); // snap-06 .. snap-15
    const daily = [{ revision: '1' }, { revision: '5' }];
    const dailyRows = [{ id: 'snap-01' }, { id: 'snap-05' }];
    const candidates = mains.map((id) => ({ id }));
    const filesBySnapshot: Record<string, any[]> = {
      'snap-02': [{ blob_id: 'blob-02' }],
      'snap-03': [{ blob_id: 'blob-03' }],
    };

    const harness = createHarness(makeFixture({
      blobs: existingBlob,
      recent,
      daily,
      dailyRows,
      candidates,
      filesBySnapshot,
      refCounts: { 'blob-02': 1, 'blob-03': 2 },
    }));

    const result = await harness.service.commitSnapshot(7, 'squad-1', 'slot-1', manifestBody(), {});

    expect(result.pruned_snapshot_ids).toEqual(['snap-02', 'snap-03', 'snap-04']);

    const deletedAt = harness.calls
      .filter(([sql]) => sql.includes('UPDATE squad_save_snapshots SET deleted_at=NOW() WHERE id=? AND deleted_at IS NULL'))
      .map(([, parameters]) => parameters[0]);
    expect(deletedAt).toEqual(['snap-02', 'snap-03', 'snap-04']);
    expect(deletedAt).not.toContain('snap-15');
    expect(deletedAt).not.toContain('snap-pinned-1');
    expect(deletedAt).not.toContain('snap-pinned-2');
    expect(deletedAt).not.toContain('snap-conflict-1');

    const fileDeletes = harness.calls
      .filter(([sql]) => sql.includes('DELETE FROM squad_save_snapshot_files WHERE snapshot_id=?'))
      .map(([, parameters]) => parameters[0]);
    expect(fileDeletes).toEqual(['snap-02', 'snap-03', 'snap-04']);

    const releases = harness.calls
      .filter(([sql]) => sql.includes('UPDATE squad_save_blobs SET ref_count=?,pending_delete_at=?'))
      .map(([, parameters]) => parameters);
    expect(releases).toEqual(expect.arrayContaining([
      [0, expect.any(Date), 'blob-02'],
      [1, null, 'blob-03'],
    ]));

    const dailyTier = harness.calls.find(([sql]) => sql.includes("SET retention_tier='daily'"));
    expect(dailyTier?.[1]).toEqual(['snap-01', 'snap-05']);

    const candidateSql = harness.calls.find(([sql]) =>
      sql.includes('SELECT id FROM squad_save_snapshots')
      && sql.includes("branch_type='main' AND pinned=0")
      && !sql.includes('revision IN')
      && !sql.includes('ORDER BY revision DESC'));
    expect(candidateSql?.[0]).toContain("branch_type='main' AND pinned=0");
  });
});

describe('SquadSaveStorageService restore', () => {
  function restoreFixture() {
    return makeFixture({
      slot: {
        id: 'slot-1', squad_id: 'squad-1', name: 'Slot', head_snapshot_id: 'head-1', active_session_id: null,
        lanlink_room_code: null, game_version: null, mods_json: null, created_by_user_id: 5, deleted_at: null,
      },
      sourceSnapshot: {
        id: 'source-1', slot_id: 'slot-1', squad_id: 'squad-1', revision: 2, parent_snapshot_id: null,
        uploader_user_id: 5, fencing_token: '2', branch_type: 'main', retention_tier: 'daily', format: 'manifest_v1',
        manifest_file_count: 1, sha256: 'd'.repeat(64), size_bytes: '10', game_version: '1.0', game_build: 123,
        map_name: 'map', wave: 4, playtime_seconds: '300', reason: 'manual', pinned: 0, created_at: new Date(),
        deleted_at: null,
      },
      sourceFiles: [{ file_path: 'saves/0.msav', size_bytes: '10', sha256: HASH_A, blob_id: 'blob-1' }],
      revision: 6,
      finalSnapshot: {
        slot_id: 'slot-1', squad_id: 'squad-1', revision: 6, parent_snapshot_id: 'head-1', uploader_user_id: 7,
        fencing_token: String(FENCING), branch_type: 'main', retention_tier: 'recent', format: 'manifest_v1',
        manifest_file_count: 1, sha256: 'd'.repeat(64), size_bytes: '10', game_version: '1.0', game_build: 123,
        map_name: 'map', wave: 4, playtime_seconds: '300', reason: 'restore', pinned: 0, created_at: new Date(),
        deleted_at: null,
      },
    });
  }

  it('refuses to restore when the head moved past the confirmed snapshot', async () => {
    const harness = createHarness(restoreFixture());

    await expect(harness.service.restore(7, 'squad-1', 'slot-1', 'source-1', {
      fencing_token: FENCING, confirm_head_snapshot_id: 'head-moved',
    }, {})).rejects.toMatchObject({ code: 'SQUAD_SAVE_CONFLICT' });

    expect(harness.calls.some(([sql]) => sql.includes('INSERT INTO squad_save_snapshots'))).toBe(false);
  });

  it('restores a snapshot as a new main revision and re-references its blobs', async () => {
    const harness = createHarness(restoreFixture());

    const result = await harness.service.restore(7, 'squad-1', 'slot-1', 'source-1', {
      fencing_token: FENCING, confirm_head_snapshot_id: 'head-1',
    }, {});

    expect(result.snapshot.id).toBe(harness.insertedSnapshotId());
    expect(result.snapshot.revision).toBe(6);
    expect(result.snapshot.is_head).toBe(true);

    const insert = harness.insertedSnapshotParams[0];
    expect(insert[4]).toBe('head-1');
    expect(insert[6]).toBe(FENCING);
    const insertSql = harness.calls.find(([sql]) => sql.includes('INSERT INTO squad_save_snapshots'))?.[0];
    expect(insertSql).toContain("VALUES (?,?,?,?,?,?,?,'main','recent'");

    expect(harness.calls.some(([sql, parameters]) =>
      sql.includes('UPDATE squad_save_blobs SET ref_count=ref_count+1')
      && (parameters as unknown[]).includes('blob-1'))).toBe(true);
    const headUpdate = harness.calls.find(([sql]) => sql.includes('UPDATE squad_save_slots SET head_snapshot_id=?'));
    expect(headUpdate?.[1][0]).toBe(result.snapshot.id);
    expect(harness.realtime.emitUser).toHaveBeenCalledWith(5, 'squad_save.snapshot_committed', expect.objectContaining({
      branch_type: 'main', snapshot_id: result.snapshot.id,
    }));
  });
});

describe('SquadSaveStorageService pin limit', () => {
  it('rejects pinning an eleventh snapshot in the same slot', async () => {
    const harness = createHarness(makeFixture({
      pinRow: { id: 'snap-1', branch_type: 'main', pinned: 0 },
      pinCount: 10,
    }));

    await expect(harness.service.setPinned(7, 'squad-1', 'slot-1', 'snap-1', true, {}))
      .rejects.toMatchObject({ code: 'SQUAD_SAVE_PIN_LIMIT_EXCEEDED' });
    expect(harness.calls.some(([sql]) => sql.includes('UPDATE squad_save_snapshots SET pinned=?'))).toBe(false);
  });
});

describe('SquadSaveStorageService ownership and upload fencing', () => {
  it('refuses to bill an upload when ownership changed before the squad lock', async () => {
    const fixture = makeFixture({ lockedOwner: 6 });
    const harness = createHarness(fixture);

    await expect(harness.service.commitSnapshot(7, 'squad-1', 'slot-1', manifestBody(), {}))
      .rejects.toMatchObject({ code: 'SQUAD_OWNER_CHANGED' });
    expect(harness.insertedSnapshotParams).toHaveLength(0);
  });

  it('rejects staged bytes once the uploader no longer holds the lease', async () => {
    const fixture = makeFixture({
      uploadSession: {
        id: 'upload-1', squad_id: 'squad-1', uploader_user_id: 7, lease_id: 'lease-1',
        sha256: HASH_A, size_bytes: '10', object_key: 'cloud-saves/5/00000000-0000-4000-8000-000000000000',
        status: 'pending', expires_at: new Date(Date.now() + 60_000),
      },
      // 租约已被其他成员接管：旧房主不能继续写入创建者配额。
      uploadLease: { holder_user_id: 5, status: 'active', expires_at: new Date(Date.now() + 60_000) },
    });
    const harness = createHarness(fixture);

    await expect(harness.service.receiveBlobUpload(7, 'squad-1', 'upload-1', {} as any, {}))
      .rejects.toMatchObject({ code: 'SQUAD_SAVE_LEASE_REQUIRED' });
    expect(harness.storage.writeObject).not.toHaveBeenCalled();
  });
});

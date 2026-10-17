import { GameSavesService } from './game-saves.service';

describe('GameSavesService privacy deletion', () => {
  it('tombstones user slots, releases each blob reference once per snapshot, and cancels pending uploads', async () => {
    const manager = { query: jest.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('SELECT id FROM users')) return [{ id: 17 }];
      if (sql.includes('SELECT id FROM game_save_slots')) return [{ id: 'slot-a' }, { id: 'slot-b' }];
      if (sql.includes('SELECT blob_id FROM game_save_snapshots')) return [{ blob_id: 'blob-a' }, { blob_id: 'blob-a' }, { blob_id: 'blob-b' }];
      if (sql.includes('SELECT ref_count FROM game_save_blobs')) return [{ ref_count: parameters[0] === 'blob-a' ? 2 : 1 }];
      if (sql.includes('UPDATE game_save_snapshots')) return { affectedRows: 3 };
      if (sql.includes('UPDATE game_save_upload_sessions')) return { affectedRows: 1 };
      return { affectedRows: 1 };
    }) };
    const dataSource = { transaction: jest.fn((work: (tx: any) => Promise<unknown>) => work(manager)) };
    const config = { get: jest.fn((key: string) => key === 'cloudSaves.gcGraceHours' ? 24 : undefined) };
    const storage = {};
    const service = new GameSavesService(dataSource as any, config as any, storage as any, {} as any);

    await expect(service.markUserDataDeleted(17)).resolves.toEqual({ slots: 2, snapshots: 3, uploads: 1 });

    const calls = manager.query.mock.calls.map(([sql]) => sql);
    expect(calls[0]).toContain('SELECT id FROM users WHERE id=? FOR UPDATE');
    const blobUpdates = manager.query.mock.calls.filter(([, parameters]) => parameters?.[2] === 'blob-a' || parameters?.[2] === 'blob-b');
    expect(blobUpdates).toEqual(expect.arrayContaining([
      [expect.stringContaining('SET ref_count=?,pending_delete_at=?,gc_in_progress=0'), [0, expect.any(Date), 'blob-a']],
      [expect.stringContaining('SET ref_count=?,pending_delete_at=?,gc_in_progress=0'), [0, expect.any(Date), 'blob-b']],
    ]));
    const cancellation = manager.query.mock.calls.find(([, parameters]) => Array.isArray(parameters) && parameters.includes('cancelled') && parameters.includes(17));
    expect(cancellation?.[0]).toContain('WHERE user_id=? AND status IN (?,?)');
    expect(manager.query.mock.calls.some(([, parameters]) => parameters?.includes('cloud_save.account_delete'))).toBe(true);
  });

  it('is safe to repeat after all save data has already been tombstoned', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM users')) return [{ id: 17 }];
      if (sql.includes('SELECT id FROM game_save_slots')) return [];
      if (sql.includes('UPDATE game_save_upload_sessions')) return { affectedRows: 0 };
      return { affectedRows: 1 };
    }) };
    const service = new GameSavesService(
      { transaction: (work: (tx: any) => Promise<unknown>) => work(manager) } as any,
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    await expect(service.markUserDataDeleted(17)).resolves.toEqual({ slots: 0, snapshots: 0, uploads: 0 });
    expect(manager.query.mock.calls.some(([, parameters]) => parameters?.includes('cloud_save.account_delete'))).toBe(false);
  });
});

describe('GameSavesService conflict details', () => {
  it('suggests a conflict copy when the head moved away from the declared base', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM users')) return [{ id: 17 }];
      if (sql.includes('SELECT * FROM game_save_slots')) return [{ id: 'slot-a', user_id: 17, name: 'Slot', current_snapshot_id: 'snap-new' }];
      if (sql.includes('SELECT id FROM game_save_snapshots')) return [{ id: 'base-snap' }];
      if (sql.includes('SELECT id, sha256 FROM game_save_snapshots')) return [{ id: 'snap-new', sha256: 'b'.repeat(64) }];
      return [];
    }) };
    const service = new GameSavesService(
      { transaction: (work: (tx: any) => Promise<unknown>) => work(manager) } as any,
      { get: jest.fn() } as any,
      { provider: 'local', isConfigured: () => true } as any,
      { getCached: jest.fn((key: string) => key === 'cloud_saves_enabled' ? 'true' : undefined) } as any,
    );

    await expect(service.createUpload(17, 'slot-a', {
      sha256: 'a'.repeat(64),
      size: 1024,
      base_snapshot_id: 'f85bde9d-4e6f-4cd9-a3ed-aac9d841d8b1',
      conflict_resolution: 'normal',
    }, {})).rejects.toMatchObject({
      code: 'SAVE_CONFLICT',
      details: [{
        base_snapshot_id: 'base-snap',
        current_snapshot_id: 'snap-new',
        suggested_resolution: 'create_conflict_copy',
      }],
    });
  });
});

describe('GameSavesService maintenance', () => {
  function serviceWith(query: jest.Mock) {
    return new GameSavesService(
      { query, transaction: (work: (tx: any) => Promise<unknown>) => work({ query }) } as any,
      { get: jest.fn() } as any,
      { provider: 'local', isConfigured: () => true } as any,
      { getCached: jest.fn() } as any,
    );
  }

  it('purges expired idempotency rows so response payloads cannot pile up', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM settings')) return [{ last_id: '0' }];
      if (sql.includes('DELETE FROM game_save_idempotency')) return { affectedRows: 4 };
      return [];
    });

    await expect(serviceWith(query).runMaintenance()).resolves.toMatchObject({ expiredIdempotencyKeys: 4 });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM game_save_idempotency WHERE expires_at < NOW()'))).toBe(true);
  });

  it('sweeps retention pages by id and wraps around at the end of the range', async () => {
    const pages: Record<string, string[]> = {
      '45': ['50', '60'],
    };
    const query = jest.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('FROM settings')) return [{ last_id: '45' }];
      if (sql.includes('id > ?')) return (pages[String(parameters[0])] || []).map((id) => ({ id }));
      if (sql.includes('FROM game_save_slots')) return [{ id: 'slot-a' }];
      if (sql.includes('SELECT id,user_id,current_snapshot_id FROM game_save_slots')) return [{ id: 'slot-a', user_id: 1, current_snapshot_id: 'snap-current' }];
      if (sql.includes('SELECT id,blob_id,created_at FROM game_save_snapshots')) return [];
      return [];
    });

    await serviceWith(query).runMaintenance();

    expect(query.mock.calls.some(([sql]) => String(sql).includes('id > ? ORDER BY id ASC'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('cloud_saves_retention_cursor'))).toBe(true);
  });

  it('restarts the retention sweep from the first slot when the cursor runs past the end', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM settings')) return [{ last_id: 'zzz' }];
      if (sql.includes('id > ?')) return [];
      return [];
    });

    await serviceWith(query).runMaintenance();

    // Falling back to the beginning is what makes the sweep a rotation instead
    // of a queue that never reaches small ids again.
    expect(query.mock.calls.some(([sql]) => String(sql).includes('WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 200'))).toBe(true);
  });
});

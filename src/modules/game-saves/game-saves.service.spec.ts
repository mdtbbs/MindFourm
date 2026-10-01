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
    expect(calls.find((sql) => sql.includes('SET status=\'cancelled\''))).toContain('WHERE user_id=?');
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

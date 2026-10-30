import { GameSavesService } from './game-saves.service';
import { normalizeManifest } from './game-save-validation';

describe('GameSavesService privacy deletion', () => {
  it('tombstones user slots, releases each blob reference once per snapshot, and cancels pending uploads', async () => {
    const manager = { query: jest.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('SELECT id FROM users')) return [{ id: 17 }];
      if (sql.includes('SELECT id FROM game_save_slots')) return [{ id: 'slot-a' }, { id: 'slot-b' }];
      if (sql.includes('FROM game_save_snapshots s')) return [
        { snapshot_id: 'snap-a', blob_id: 'blob-a' },
        { snapshot_id: 'snap-b', blob_id: 'blob-a' },
        { snapshot_id: 'snap-c', blob_id: 'blob-b' },
      ];
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
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM game_save_snapshot_files'))).toBe(true);
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
      if (sql.includes('SELECT id, sha256, format FROM game_save_snapshots')) return [{ id: 'snap-new', sha256: 'b'.repeat(64), format: 'zip' }];
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

describe('GameSavesService delta uploads', () => {
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);
  const HASH_C = 'c'.repeat(64);
  const BASE = 'f85bde9d-4e6f-4cd9-a3ed-aac9d841d8b1';
  const enabledSettings = { getCached: jest.fn((key: string) => key === 'cloud_saves_enabled' ? 'true' : undefined) };
  const storage = {
    provider: 'local', isConfigured: () => true,
    statObject: jest.fn(async (key: string) => ({ exists: true, size_bytes: String(key).includes('00000000') ? 20 : 10 })),
  };

  function build(query: jest.Mock, transaction?: jest.Mock) {
    return new GameSavesService(
      { query, transaction: transaction || ((work: (tx: any) => Promise<unknown>) => work({ query })) } as any,
      { get: jest.fn() } as any,
      storage as any,
      enabledSettings as any,
    );
  }

  it('splits checked hashes into already-held and missing sets', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM game_save_blobs')) return [{ sha256: HASH_A }];
      if (sql.includes('FROM game_save_blob_uploads')) return [{ sha256: HASH_B }];
      return [];
    });

    await expect(build(query).checkBlobs(17, { sha256: [HASH_A, HASH_B, HASH_C] }))
      .resolves.toEqual({ exists: [HASH_A, HASH_B], missing: [HASH_C] });
  });

  it('skips a blob upload when the account already holds the content', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM users')) return [{ id: 17 }];
      if (sql.includes('SELECT id,gc_in_progress,ref_count,object_key')) return [{ id: 'blob-a', gc_in_progress: 0, ref_count: 1, object_key: 'cloud-saves/17/existing' }];
      return [];
    }) };
    const service = build(jest.fn(), (work: (tx: any) => Promise<unknown>) => work(manager) as any);

    await expect(service.createBlobUpload(17, { sha256: HASH_A, size: 10 }, {})).resolves.toEqual({
      no_upload_required: true, sha256: HASH_A, size: 10,
    });
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO game_save_blob_uploads'))).toBe(false);
  });

  it('creates a manifest snapshot that reuses existing blobs and promotes staged uploads', async () => {
    const manager = { query: jest.fn(async (sql: string, parameters: any[] = []) => {
      if (sql.includes('SELECT id FROM users')) return [{ id: 17 }];
      if (sql.includes('SELECT * FROM game_save_slots')) return [{ id: 'slot-a', user_id: 17, name: 'Slot', current_snapshot_id: BASE }];
      if (sql.includes('SELECT id FROM game_save_snapshots WHERE id = ?')) return [{ id: BASE }];
      if (sql.includes('SELECT * FROM game_save_snapshots WHERE id = ?')) return [{ id: BASE, revision: 1, format: 'zip', sha256: 'f'.repeat(64), size_bytes: '5', manifest_file_count: null, created_at: new Date() }];
      if (sql.includes('SELECT id,ref_count,gc_in_progress,object_key FROM game_save_blobs')) {
        return parameters[1] === HASH_A ? [{ id: 'blob-a', ref_count: 1, gc_in_progress: 0, object_key: 'cloud-saves/17/existing' }] : [];
      }
      if (sql.includes('FROM game_save_blob_uploads') && sql.includes('SELECT id,object_key')) {
        return [{ id: 'upload-b', object_key: 'cloud-saves/17/00000000-0000-4000-8000-000000000000', storage_provider: 'local' }];
      }
      if (sql.includes('SELECT COALESCE(SUM(size_bytes),0) AS used_bytes')) return [{ used_bytes: '100' }];
      if (sql.includes('SELECT DISTINCT sha256,size_bytes FROM game_save_blob_uploads')) return [];
      if (sql.includes('MAX(revision)')) return [{ revision: 2 }];
      if (sql.includes('SELECT id,gc_in_progress FROM game_save_blobs')) return [{ id: parameters[0], gc_in_progress: 0 }];
      return { affectedRows: 1 };
    }) };
    const service = build(jest.fn(), (work: (tx: any) => Promise<unknown>) => work(manager) as any);

    const result = await service.createManifestSnapshot(17, 'slot-a', {
      base_snapshot_id: BASE,
      manifest: { files: [
        { path: 'saves/0.msav', size: 10, sha256: HASH_A },
        { path: 'settings.bin', size: 20, sha256: HASH_B },
      ] },
    }, {});

    expect(result.format).toBe('manifest');
    expect(result.file_count).toBe(2);
    expect(result.size).toBe(30);
    const refUpdates = manager.query.mock.calls.filter(([sql]) => String(sql).includes('SET ref_count=ref_count+1'));
    expect(refUpdates).toHaveLength(2);
    const fileInsert = manager.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO game_save_snapshot_files'));
    expect(fileInsert?.[0]).toContain('(?,?,?,?,?,?)');
    expect(fileInsert?.[1]).toEqual(expect.arrayContaining(['saves/0.msav', 'settings.bin']));
  });

  it('rejects a manifest whose blob was never uploaded', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM users')) return [{ id: 17 }];
      if (sql.includes('SELECT * FROM game_save_slots')) return [{ id: 'slot-a', user_id: 17, name: 'Slot', current_snapshot_id: null }];
      if (sql.includes('SELECT id,ref_count,gc_in_progress FROM game_save_blobs')) return [];
      if (sql.includes('FROM game_save_blob_uploads')) return [];
      return [];
    }) };
    const service = build(jest.fn(), (work: (tx: any) => Promise<unknown>) => work(manager) as any);

    await expect(service.createManifestSnapshot(17, 'slot-a', {
      manifest: { files: [{ path: 'saves/0.msav', size: 10, sha256: HASH_A }] },
    }, {})).rejects.toMatchObject({ code: 'SAVE_BLOB_MISSING' });
  });

  it('refuses to read a manifest from a whole-package snapshot', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM game_save_slots')) return [{ id: 'slot-a' }];
      if (sql.includes('SELECT * FROM game_save_snapshots')) return [{ id: 'snap-zip', format: 'zip' }];
      return [];
    });

    await expect(build(query).getManifest(17, 'slot-a', 'snap-zip'))
      .rejects.toMatchObject({ code: 'SAVE_SNAPSHOT_FORMAT_MISMATCH' });
  });

  it('keeps whole-package download grants off manifest snapshots', async () => {
    const query = jest.fn(async () => [{
      slot_name: 'Slot', id: 'snap-manifest', format: 'manifest', blob_id: null,
      size_bytes: '30', sha256: HASH_A, object_key: null, storage_provider: null,
    }]);

    await expect(build(query).downloadGrant(17, 'slot-a', 'snap-manifest', {}))
      .rejects.toMatchObject({ code: 'SAVE_SNAPSHOT_FORMAT_MISMATCH' });
  });
});


describe('GameSavesService delta hardening', () => {
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);
  const BASE = 'f85bde9d-4e6f-4cd9-a3ed-aac9d841d8b1';
  const settings = { getCached: jest.fn((key: string) => key === 'cloud_saves_enabled' ? 'true' : undefined) };
  const future = new Date(Date.now() + 60_000);
  const storage = {
    provider: 'local', isConfigured: () => true,
    writeObject: jest.fn(),
    deleteObject: jest.fn(),
    statObject: jest.fn(async (key: string) => ({ exists: true, size_bytes: String(key).includes('upload') ? 20 : 10 })),
  };
  function build(query: jest.Mock, tx?: (work: (tx: any) => Promise<unknown>) => Promise<unknown>) {
    return new GameSavesService(
      { query, transaction: tx || ((work: (m: any) => Promise<unknown>) => work({ query })) } as any,
      { get: jest.fn() } as any,
      storage as any,
      settings as any,
    );
  }
  function manifestFiles(files: Array<{ path: string; size: number; sha256: string }>) {
    return normalizeManifest({ files }, 5000, 52428800, 1048576);
  }

  it('counts a blob referenced by two manifest paths only once', async () => {
    const manager = { query: jest.fn(async (sql: string, p: any[] = []) => {
      if (sql.includes('SELECT id FROM users')) return [{ id: 17 }];
      if (sql.includes('SELECT * FROM game_save_slots')) return [{ id: 'slot-a', user_id: 17, name: 'Slot', current_snapshot_id: BASE }];
      if (sql.includes('SELECT id FROM game_save_snapshots WHERE id = ?')) return [{ id: BASE }];
      if (sql.includes('SELECT * FROM game_save_snapshots WHERE id = ?')) return [{ id: BASE, revision: 1, format: 'zip', sha256: 'f'.repeat(64), size_bytes: '5', manifest_file_count: null, created_at: new Date() }];
      if (sql.includes('SELECT id,ref_count,gc_in_progress,object_key FROM game_save_blobs')) return [{ id: 'blob-a', ref_count: 1, gc_in_progress: 0, object_key: 'cloud-saves/17/existing' }];
      if (sql.includes('SELECT COALESCE(SUM(size_bytes),0) AS used_bytes')) return [{ used_bytes: '0' }];
      if (sql.includes('SELECT DISTINCT sha256,size_bytes FROM game_save_blob_uploads')) return [];
      if (sql.includes('MAX(revision)')) return [{ revision: 2 }];
      if (sql.includes('SELECT id,gc_in_progress FROM game_save_blobs')) return [{ id: p[0], gc_in_progress: 0 }];
      return { affectedRows: 1 };
    }) };
    const service = build(jest.fn(), (work) => work(manager));

    const result = await service.createManifestSnapshot(17, 'slot-a', {
      base_snapshot_id: BASE,
      manifest: { files: [
        { path: 'saves/0.msav', size: 10, sha256: HASH_A },
        { path: 'saves/1.msav', size: 10, sha256: HASH_A },
      ] },
    }, {});

    expect(result.file_count).toBe(2);
    const refUpdates = manager.query.mock.calls.filter(([sql]) => String(sql).includes('SET ref_count=ref_count+1'));
    expect(refUpdates).toHaveLength(1);
  });

  it('releases each distinct file blob when a manifest snapshot is deleted', async () => {
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM game_save_slots') && sql.includes('FOR UPDATE')) return [{ id: 'slot-a', user_id: 17, current_snapshot_id: 'snap-current' }];
      if (sql.includes('SELECT blob_id,format FROM game_save_snapshots')) return [{ blob_id: null, format: 'manifest' }];
      if (sql.includes('SELECT DISTINCT blob_id FROM game_save_snapshot_files')) return [{ blob_id: 'blob-a' }, { blob_id: 'blob-b' }];
      if (sql.includes('SELECT ref_count FROM game_save_blobs')) return [{ ref_count: 1 }];
      return { affectedRows: 1 };
    }) };
    const service = build(jest.fn(), (work) => work(manager));

    await service.deleteSnapshot(17, 'slot-a', 'snap-old', {});

    const released = manager.query.mock.calls
      .filter(([sql]) => String(sql).includes('SET ref_count=?,pending_delete_at=?,gc_in_progress=0'))
      .map(([, p]) => p[2]);
    expect(released).toEqual(expect.arrayContaining(['blob-a', 'blob-b']));
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM game_save_snapshot_files'))).toBe(true);
  });

  it('sweeps staged blob uploads and never deletes committed objects', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT id,object_key,status FROM game_save_blob_uploads')) return [
        { id: 'u-pending', object_key: 'cloud-saves/17/pending', status: 'pending' },
        { id: 'u-committed', object_key: 'cloud-saves/17/committed', status: 'committed' },
      ];
      if (sql.includes('FROM settings')) return [{ last_id: '0' }];
      if (sql.includes('id > ?')) return [];
      if (sql.includes('DELETE FROM game_save_idempotency')) return { affectedRows: 0 };
      return [];
    });
    const service = build(query);

    const result = await service.runMaintenance();

    expect(result.expiredBlobUploads).toBe(2);
    expect(storage.deleteObject).toHaveBeenCalledWith('cloud-saves/17/pending');
    expect(storage.deleteObject).not.toHaveBeenCalledWith('cloud-saves/17/committed');
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('DELETE FROM game_save_blob_uploads'))).toHaveLength(2);
  });

  it('treats an unchanged manifest as a no-op instead of a new revision', async () => {
    const files = [{ path: 'saves/0.msav', size: 10, sha256: HASH_A }];
    const manifest = manifestFiles(files);
    const manager = { query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM users')) return [{ id: 17 }];
      if (sql.includes('SELECT * FROM game_save_slots')) return [{ id: 'slot-a', user_id: 17, name: 'Slot', current_snapshot_id: BASE }];
      if (sql.includes('SELECT id FROM game_save_snapshots WHERE id = ?')) return [{ id: BASE }];
      if (sql.includes('SELECT * FROM game_save_snapshots WHERE id = ?')) return [{
        id: BASE, slot_id: 'slot-a', revision: 1, format: 'manifest', sha256: manifest.manifest_hash,
        size_bytes: String(manifest.total_size), manifest_file_count: 1, game_version: null, game_build: null,
        map_name: null, wave: null, playtime_seconds: null, reason: 'manual', created_at: new Date(),
      }];
      return { affectedRows: 1 };
    }) };
    const service = build(jest.fn(), (work) => work(manager));

    const result = await service.createManifestSnapshot(17, 'slot-a', { base_snapshot_id: BASE, manifest: { files } }, {});

    expect(result.no_changes).toBe(true);
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO game_save_snapshots'))).toBe(false);
  });

  it('reports the unique-blob charge alongside logical bytes and manifest limits', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('used_bytes FROM game_save_blobs')) return [{ used_bytes: '100' }];
      if (sql.includes('used_slots')) return [{ used_slots: '2' }];
      if (sql.includes('logical_bytes')) return [{ logical_bytes: '500' }];
      return [];
    });
    const result = await build(query).getQuota(17);

    expect(result).toMatchObject({
      used_bytes: 100, logical_bytes: 500, formats: ['zip', 'manifest'],
      manifest_limits: { max_files: 5000, max_manifest_bytes: 1048576 },
    });
  });

  it('rejects an expired ready blob upload session instead of reporting success', async () => {
    const query = jest.fn(async () => [{
      id: 'u1', user_id: 17, status: 'ready', sha256: HASH_A, size_bytes: '10',
      object_key: 'cloud-saves/17/obj', expires_at: new Date(Date.now() - 1000),
    }]);
    await expect(build(query).receiveBlobUpload(17, 'u1', {} as any, {}))
      .rejects.toMatchObject({ code: 'SAVE_UPLOAD_EXPIRED' });
  });

  it('keeps the object when a concurrent PUT already marked the session ready', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM game_save_blob_uploads WHERE id=? AND user_id=? LIMIT 1')) return [{
        id: 'u1', user_id: 17, status: 'pending', sha256: HASH_A, size_bytes: '10',
        object_key: 'cloud-saves/17/obj', expires_at: future,
      }];
      if (sql.includes('UPDATE game_save_blob_uploads SET status=')) return { affectedRows: 0 };
      if (sql.includes('SELECT status, size_bytes, sha256, expires_at FROM game_save_blob_uploads')) return [{
        status: 'ready', size_bytes: '10', sha256: HASH_A, expires_at: future,
      }];
      return { affectedRows: 1 };
    });
    const result = await build(query).receiveBlobUpload(17, 'u1', {} as any, {});

    expect(result).toMatchObject({ uploaded: true, status: 'ready' });
    expect(storage.deleteObject).not.toHaveBeenCalledWith('cloud-saves/17/obj');
  });
});

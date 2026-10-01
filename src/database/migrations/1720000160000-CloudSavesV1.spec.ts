import { CloudSavesV11720000160000 } from './1720000160000-CloudSavesV1';

describe('CloudSavesV1 migration', () => {
  it('creates owner-scoped slot, immutable snapshot, blob, upload, and idempotency tables', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new CloudSavesV11720000160000().up({ query } as any);
    const ddl = query.mock.calls.map(([sql]) => String(sql)).join('\n');

    for (const table of ['game_save_slots', 'game_save_blobs', 'game_save_snapshots', 'game_save_upload_sessions', 'game_save_idempotency']) {
      expect(ddl).toContain(`CREATE TABLE ${table}`);
    }
    expect(ddl).toContain('UNIQUE KEY uq_game_save_blob_user_sha_size (user_id, sha256, size_bytes)');
    expect(ddl).toContain('FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE');
    expect(ddl).toContain('FOREIGN KEY (blob_id) REFERENCES game_save_blobs(id) ON DELETE RESTRICT');
    expect(ddl).toContain('UNIQUE KEY uq_game_save_snapshot_slot_revision (slot_id, revision)');
    expect(ddl).toContain('UNIQUE KEY uq_game_save_idempotency_scope (user_id, operation, idempotency_key)');
  });

  it('rolls down from children to parents without contacting a database outside TypeORM', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    await new CloudSavesV11720000160000().down({ query } as any);
    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain('game_save_idempotency');
    expect(statements[1]).toContain('game_save_upload_sessions');
    expect(statements[2]).toContain('DROP FOREIGN KEY');
    expect(statements.at(-1)).toContain('game_save_slots');
  });
});

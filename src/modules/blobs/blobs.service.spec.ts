import { createHash } from 'node:crypto';
import { BlobStorageError } from './blob-storage.service';
import { BlobsService } from './blobs.service';

/** Route each statement to the facts the code under test actually needs. */
function fakeSource(handler: (sql: string, parameters: unknown[]) => any) {
  const calls: Array<[string, unknown[]]> = [];
  const query = jest.fn(async (sql: string, parameters: unknown[] = []) => {
    calls.push([sql, parameters]);
    return handler(sql, parameters);
  });
  const manager = { query };
  const dataSource = {
    query,
    manager,
    transaction: jest.fn((work: (tx: any) => Promise<unknown>) => work(manager)),
  };
  return { dataSource, manager, calls };
}

function service(dataSource: any, overrides: Record<string, unknown> = {}) {
  const settings = {
    getCached: (key: string) => {
      if (key === 'blobs_enabled') return 'true';
      if (key === 'blobs_storage_path') return '/srv/blobs';
      return null;
    },
    get: jest.fn(async () => null),
    ...overrides,
  };
  const storage = {
    provider: 'local',
    isConfigured: () => true,
    writeObject: jest.fn(async () => undefined),
    verifyObject: jest.fn(async () => true),
    statObject: jest.fn(async () => ({ exists: true, size_bytes: 4 })),
    openObject: jest.fn(async () => ({ stream: null, size: 4, last_modified: new Date() })),
    deleteObject: jest.fn(async () => undefined),
  };
  return {
    storage,
    instance: new BlobsService(dataSource, { get: () => 'https://forum.example' } as any, storage as any, settings as any),
  };
}

const owner = BlobsService.userOwner(17);
const hashOf = (value: string) => createHash('sha256').update(value).digest('hex');
const baseInput = { key: 'cover.png', file_name: 'cover.png', size_bytes: 4, sha256: hashOf('data'), mime_type: 'image/png' };

describe('BlobsService namespace and key validation', () => {
  it('rejects reserved namespaces, malformed keys and non-hex digests before touching storage', async () => {
    const { dataSource } = fakeSource(() => []);
    const { instance, storage } = service(dataSource);

    for (const namespace of ['system', 'admin', 'Platform', 'with/slash', '']) {
      if (namespace === '') continue;
      await expect(instance.createUpload(owner, { ...baseInput, namespace }, {})).rejects.toMatchObject({ code: 'BLOB_KEY_INVALID' });
    }
    await expect(instance.createUpload(owner, { ...baseInput, key: '  ' }, {})).rejects.toMatchObject({ code: 'BLOB_KEY_INVALID' });
    await expect(instance.createUpload(owner, { ...baseInput, sha256: 'not-a-hash' }, {})).rejects.toMatchObject({ code: 'BLOB_INVALID_HASH' });
    await expect(instance.createUpload(owner, { ...baseInput, mime_type: 'not a mime' }, {})).rejects.toMatchObject({ code: 'BLOB_METADATA_INVALID' });
    await expect(instance.createUpload(owner, { ...baseInput, size_bytes: 0 }, {})).rejects.toMatchObject({ code: 'BLOB_METADATA_INVALID' });
    expect(storage.writeObject).not.toHaveBeenCalled();
  });

  it('refuses to operate when the feature is disabled', async () => {
    const { dataSource } = fakeSource(() => []);
    const { instance } = service(dataSource, { getCached: () => null });
    await expect(instance.createUpload(owner, baseInput, {})).rejects.toMatchObject({ code: 'BLOBS_DISABLED' });
  });

  it('caps the declared size at the configured per-object limit', async () => {
    const { dataSource } = fakeSource(() => []);
    const { instance } = service(dataSource, {
      getCached: (key: string) => key === 'blobs_enabled' ? 'true' : key === 'blobs_max_object_bytes' ? '1024' : '/srv/blobs',
    });
    await expect(instance.createUpload(owner, { ...baseInput, size_bytes: 2048 }, {})).rejects.toMatchObject({ code: 'BLOB_FILE_TOO_LARGE' });
  });
});

describe('BlobsService upload session lifecycle', () => {
  it('opens a session and reports that bytes must be uploaded', async () => {
    const { dataSource, calls } = fakeSource((sql) => {
      if (sql.includes('AS used_bytes')) return [{ used_bytes: 0 }];
      if (sql.includes('AS reserved_bytes')) return [{ reserved_bytes: 0 }];
      if (sql.includes('COUNT(*) AS count FROM blob_upload_sessions')) return [{ count: 0 }];
      if (sql.includes('FROM blob_objects')) return [];
      return { affectedRows: 1 };
    });
    const { instance } = service(dataSource);

    const result = await instance.createUpload(owner, baseInput, { ip: '127.0.0.1' });

    expect(result).toMatchObject({ deduplicated: false, commit_required: true });
    expect(result.upload?.url).toContain(`/api/v1/blobs/uploads/${result.upload_id}/content`);
    const insert = calls.find(([sql]) => sql.includes('INSERT INTO blob_upload_sessions'));
    expect(insert?.[1]).toContain('cover.png');
    // Object keys are server-generated and never derived from the client's filename.
    const objectKey = insert?.[1].find((value) => typeof value === 'string' && value.startsWith('blobs/')) as string;
    expect(objectKey).toMatch(/^blobs\/default\/[0-9a-f]{32}\/[0-9a-f-]{36}$/);
    expect(objectKey).not.toContain('cover');
  });

  it('answers a repeated create with the stored response instead of a second session', async () => {
    const stored = { upload_id: 'upload-1', deduplicated: false, commit_required: true };
    let fingerprint: string | undefined;
    const { dataSource, calls } = fakeSource((sql, parameters) => {
      if (sql.includes('AS used_bytes')) return [{ used_bytes: 0 }];
      if (sql.includes('AS reserved_bytes')) return [{ reserved_bytes: 0 }];
      if (sql.includes('COUNT(*) AS count FROM blob_upload_sessions')) return [{ count: 0 }];
      if (sql.includes('FROM blob_objects')) return [];
      if (sql.includes('INSERT INTO blob_idempotency')) {
        fingerprint = parameters[4] as string;
        throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
      }
      if (sql.includes('SELECT request_sha256,response_json FROM blob_idempotency')) {
        return [{ request_sha256: fingerprint, response_json: JSON.stringify(stored) }];
      }
      return { affectedRows: 1 };
    });
    const { instance } = service(dataSource);

    // A replay is served from the stored row, so no second session is created.
    await expect(instance.createUpload(owner, baseInput, {}, 'key-1')).resolves.toEqual(stored);
    expect(calls.some(([sql]) => sql.includes('INSERT INTO blob_upload_sessions'))).toBe(false);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects reusing one idempotency key for a different payload', async () => {
    const { dataSource } = fakeSource((sql) => {
      if (sql.includes('INSERT INTO blob_idempotency')) throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
      if (sql.includes('SELECT request_sha256,response_json FROM blob_idempotency')) {
        return [{ request_sha256: 'f'.repeat(64), response_json: '{}' }];
      }
      return { affectedRows: 1 };
    });
    const { instance } = service(dataSource);
    await expect(instance.createUpload(owner, baseInput, {}, 'key-1')).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('treats an existing identical object as deduplicated so no bytes move again', async () => {
    const { dataSource, calls } = fakeSource((sql) => {
      if (sql.includes('COUNT(*) AS count FROM blob_upload_sessions')) return [{ count: 0 }];
      if (sql.includes('COALESCE(SUM(size_bytes)')) return [{ used_bytes: 0 }];
      if (sql.includes('COALESCE(SUM(size_bytes),0) AS reserved_bytes')) return [{ reserved_bytes: 0 }];
      if (sql.includes('FROM blob_objects')) return [{ id: 'object-1' }];
      return { affectedRows: 1 };
    });
    const { instance } = service(dataSource);

    const result = await instance.createUpload(owner, baseInput, {});
    expect(result).toMatchObject({ deduplicated: true, commit_required: true });
    expect(result.upload).toBeUndefined();
    expect(calls.some(([sql, parameters]) => sql.includes('UPDATE blob_upload_sessions SET object_id') && parameters[0] === 'object-1')).toBe(true);
  });

  it('writes uploaded bytes against the session and verifies them', async () => {
    const { dataSource } = fakeSource((sql) => {
      if (sql.includes('SELECT * FROM blob_upload_sessions')) {
        return [{
          id: 'upload-1', status: 'pending', object_key: 'blobs/default/' + 'a'.repeat(32) + '/00000000-0000-4000-8000-000000000000',
          expected_sha256: hashOf('data'), expected_size_bytes: '4', namespace: 'default', expires_at: new Date(Date.now() + 60_000),
        }];
      }
      return { affectedRows: 1 };
    });
    const { instance, storage } = service(dataSource);

    const receipt = await instance.receiveUpload(owner, 'upload-1', {} as any, {});
    expect(receipt).toMatchObject({ uploaded: true, size_bytes: 4, sha256: hashOf('data') });
    expect(storage.writeObject).toHaveBeenCalledWith(
      'blobs/default/' + 'a'.repeat(32) + '/00000000-0000-4000-8000-000000000000',
      expect.anything(), 4, hashOf('data'), expect.any(Number),
    );
  });

  it('does not write a second copy when the session already holds its bytes', async () => {
    const { dataSource } = fakeSource((sql) => {
      if (sql.includes('SELECT * FROM blob_upload_sessions')) {
        return [{ id: 'upload-1', status: 'pending', object_id: 'object-1', expected_sha256: hashOf('data'), expected_size_bytes: '4' }];
      }
      return { affectedRows: 1 };
    });
    const { instance, storage } = service(dataSource);

    await expect(instance.receiveUpload(owner, 'upload-1', {} as any, {})).resolves.toMatchObject({ deduplicated: true });
    expect(storage.writeObject).not.toHaveBeenCalled();
  });

  it('refuses to accept a body for an expired or committed session', async () => {
    const expired = fakeSource(() => [{
      id: 'upload-1', status: 'pending', object_key: 'k', expected_sha256: hashOf('data'), expected_size_bytes: '4',
      expires_at: new Date(Date.now() - 60_000),
    }]);
    await expect(service(expired.dataSource).instance.receiveUpload(owner, 'upload-1', {} as any, {}))
      .rejects.toMatchObject({ code: 'BLOB_UPLOAD_EXPIRED' });

    const committed = fakeSource(() => [{ id: 'upload-1', status: 'committed', committed_blob_id: 'blob-1' }]);
    await expect(service(committed.dataSource).instance.receiveUpload(owner, 'upload-1', {} as any, {}))
      .rejects.toMatchObject({ code: 'BLOB_UPLOAD_ALREADY_COMMITTED' });
  });

  it('maps storage checksum failures onto the upload error codes', async () => {
    const { dataSource } = fakeSource((sql) => {
      if (sql.includes('SELECT * FROM blob_upload_sessions')) {
        return [{
          id: 'upload-1', status: 'pending', object_key: 'blobs/default/' + 'a'.repeat(32) + '/00000000-0000-4000-8000-000000000000',
          expected_sha256: hashOf('data'), expected_size_bytes: '4', expires_at: new Date(Date.now() + 60_000),
        }];
      }
      return { affectedRows: 1 };
    });
    const { instance, storage } = service(dataSource);
    storage.writeObject.mockRejectedValueOnce(new BlobStorageError('bad', 'BLOB_UPLOAD_CHECKSUM_MISMATCH'));

    await expect(instance.receiveUpload(owner, 'upload-1', {} as any, {})).rejects.toMatchObject({ code: 'BLOB_UPLOAD_CHECKSUM_MISMATCH' });
  });

  it('deletes a late object when the session expired while the body streamed in', async () => {
    const objectKey = 'blobs/default/' + 'a'.repeat(32) + '/00000000-0000-4000-8000-000000000000';
    const { dataSource } = fakeSource((sql) => {
      if (sql.includes('SELECT * FROM blob_upload_sessions')) {
        return [{ id: 'upload-1', status: 'pending', object_key: objectKey, expected_sha256: hashOf('data'), expected_size_bytes: '4', expires_at: new Date(Date.now() + 60_000) }];
      }
      if (sql.includes("SET status='uploaded'")) return { affectedRows: 0 };
      return { affectedRows: 1 };
    });
    const { instance, storage } = service(dataSource);

    await expect(instance.receiveUpload(owner, 'upload-1', {} as any, {})).rejects.toMatchObject({ code: 'BLOB_UPLOAD_EXPIRED' });
    expect(storage.deleteObject).toHaveBeenCalledWith(objectKey);
  });

  it('cancels a session and refuses to cancel a committed one', async () => {
    const pending = fakeSource((sql) => sql.includes('SELECT id,status,object_key FROM blob_upload_sessions')
      ? [{ id: 'upload-1', status: 'pending', object_key: 'k' }] : { affectedRows: 1 });
    await expect(service(pending.dataSource).instance.cancelUpload(owner, 'upload-1', {}))
      .resolves.toEqual({ id: 'upload-1', cancelled: true });

    const done = fakeSource(() => [{ id: 'upload-1', status: 'committed', object_key: 'k' }]);
    await expect(service(done.dataSource).instance.cancelUpload(owner, 'upload-1', {}))
      .rejects.toMatchObject({ code: 'BLOB_UPLOAD_ALREADY_COMMITTED' });
  });
});

describe('BlobsService commit', () => {
  const session = {
    id: 'upload-1', status: 'uploaded', namespace: 'default', blob_key: 'cover.png', owner_type: 'user', owner_id: '17',
    object_key: 'blobs/default/' + 'a'.repeat(32) + '/00000000-0000-4000-8000-000000000000',
    expected_sha256: hashOf('data'), expected_size_bytes: '4', file_name: 'cover.png', mime_type: 'image/png',
    visibility: 'private', metadata_json: null, tags_json: null, ref_type: null, ref_id: null,
    record_expires_at: null, expires_at: new Date(Date.now() + 60_000),
  };

  function commitSource(overrides: (sql: string, parameters: unknown[]) => any) {
    return fakeSource((sql, parameters) => {
      if (sql.includes('FROM blob_upload_sessions')) return [session];
      if (sql.includes('FROM blob_records') && sql.includes("status='active'") && sql.includes('FOR UPDATE')) return [];
      if (sql.includes('FROM blob_objects')) return [];
      if (sql.includes('SELECT r.*,o.object_key FROM blob_records r JOIN blob_objects o')) {
        return [{
          id: 'blob-new', namespace: 'default', blob_key: 'cover.png', owner_type: 'user', owner_id: '17',
          file_name: 'cover.png', mime_type: 'image/png', size_bytes: '4', sha256: hashOf('data'), visibility: 'private',
          metadata_json: null, tags_json: null, ref_type: null, ref_id: null, expires_at: null,
          created_at: new Date(), updated_at: new Date(), object_key: session.object_key,
        }];
      }
      return overrides(sql, parameters);
    });
  }

  it('re-reads the stored object and creates the binding from server-verified facts', async () => {
    const { dataSource, calls } = commitSource(() => ({ affectedRows: 1 }));
    const { instance, storage } = service(dataSource);

    const result = await instance.commitUpload(owner, 'upload-1', {});

    expect(storage.verifyObject).toHaveBeenCalledWith(session.object_key, 4, hashOf('data'), expect.any(Number));
    expect(result).toMatchObject({ committed: true });
    expect(result.blob).toMatchObject({ key: 'cover.png', size_bytes: 4, sha256: hashOf('data'), visibility: 'private' });
    const insert = calls.find(([sql]) => sql.includes('INSERT INTO blob_records'));
    expect(insert?.[1]).toContain(hashOf('data'));
    expect(calls.some(([sql]) => sql.includes("status='committed'"))).toBe(true);
  });

  it('replaces the previous binding for the same key and releases its reference', async () => {
    const { dataSource, calls } = fakeSource((sql) => {
      if (sql.includes('FROM blob_upload_sessions')) return [session];
      if (sql.includes('FROM blob_records') && sql.includes('FOR UPDATE')) return [{ id: 'blob-old', object_id: 'object-old' }];
      if (sql.includes('SELECT id,ref_count FROM blob_objects')) return [{ id: 'object-old', ref_count: 1 }];
      if (sql.includes('FROM blob_objects')) return [];
      if (sql.includes('SELECT r.*,o.object_key FROM blob_records r JOIN blob_objects o')) {
        return [{ id: 'blob-new', namespace: 'default', blob_key: 'cover.png', owner_type: 'user', owner_id: '17',
          file_name: 'cover.png', mime_type: 'image/png', size_bytes: '4', sha256: hashOf('data'), visibility: 'private',
          metadata_json: null, tags_json: null, ref_type: null, ref_id: null, expires_at: null,
          created_at: new Date(), updated_at: new Date(), object_key: session.object_key }];
      }
      return { affectedRows: 1 };
    });
    const { instance } = service(dataSource);

    await instance.commitUpload(owner, 'upload-1', {});

    expect(calls.some(([sql, parameters]) => sql.includes("SET status='deleted'") && parameters[0] === 'blob-old')).toBe(true);
    expect(calls.some(([sql, parameters]) => sql.includes('SET ref_count=?') && parameters[0] === 0 && parameters[3] === 'object-old')).toBe(true);
  });

  it('refuses to commit when the object never arrived or no longer matches', async () => {
    const missing = commitSource(() => ({ affectedRows: 1 }));
    const missingService = service(missing.dataSource);
    missingService.storage.verifyObject.mockResolvedValueOnce(false);
    missingService.storage.statObject.mockResolvedValueOnce({ exists: false });
    await expect(missingService.instance.commitUpload(owner, 'upload-1', {})).rejects.toMatchObject({ code: 'BLOB_UPLOAD_OBJECT_MISSING' });

    const mismatch = commitSource(() => ({ affectedRows: 1 }));
    const mismatchService = service(mismatch.dataSource);
    mismatchService.storage.verifyObject.mockResolvedValueOnce(false);
    mismatchService.storage.statObject.mockResolvedValueOnce({ exists: true, size_bytes: 99 });
    await expect(mismatchService.instance.commitUpload(owner, 'upload-1', {})).rejects.toMatchObject({ code: 'BLOB_UPLOAD_SIZE_MISMATCH' });

    const badSum = commitSource(() => ({ affectedRows: 1 }));
    const badSumService = service(badSum.dataSource);
    badSumService.storage.verifyObject.mockResolvedValueOnce(false);
    badSumService.storage.statObject.mockResolvedValueOnce({ exists: true, size_bytes: 4 });
    await expect(badSumService.instance.commitUpload(owner, 'upload-1', {})).rejects.toMatchObject({ code: 'BLOB_UPLOAD_CHECKSUM_MISMATCH' });
  });

  it('marks the session expired instead of committing past its deadline', async () => {
    const { dataSource, calls } = fakeSource((sql) => {
      if (sql.includes('FROM blob_upload_sessions')) return [{ ...session, expires_at: new Date(Date.now() - 1000) }];
      return { affectedRows: 1 };
    });
    await expect(service(dataSource).instance.commitUpload(owner, 'upload-1', {}))
      .rejects.toMatchObject({ code: 'BLOB_UPLOAD_EXPIRED' });
    expect(calls.some(([sql]) => sql.includes("SET status='expired'"))).toBe(true);
  });

  it('revives an unreferenced object instead of storing the same bytes twice', async () => {
    const { dataSource, calls } = fakeSource((sql) => {
      if (sql.includes('FROM blob_upload_sessions')) return [session];
      if (sql.includes('FROM blob_records') && sql.includes('FOR UPDATE')) return [];
      if (sql.includes('SELECT * FROM blob_objects')) {
        return [{ id: 'object-existing', ref_count: 0, gc_in_progress: 0, object_key: session.object_key }];
      }
      if (sql.includes('SELECT r.*,o.object_key FROM blob_records r JOIN blob_objects o')) {
        return [{ id: 'blob-new', namespace: 'default', blob_key: 'cover.png', owner_type: 'user', owner_id: '17',
          file_name: 'cover.png', mime_type: 'image/png', size_bytes: '4', sha256: hashOf('data'), visibility: 'private',
          metadata_json: null, tags_json: null, ref_type: null, ref_id: null, expires_at: null,
          created_at: new Date(), updated_at: new Date(), object_key: session.object_key }];
      }
      return { affectedRows: 1 };
    });
    const { instance } = service(dataSource);

    await instance.commitUpload(owner, 'upload-1', {});

    expect(calls.some(([sql, parameters]) => sql.includes('SET ref_count=1,gc_in_progress=0') && parameters.includes('object-existing'))).toBe(true);
    expect(calls.some(([sql]) => sql.includes('INSERT INTO blob_objects'))).toBe(false);
  });

  it('refuses to revive an object a maintenance sweep already claimed', async () => {
    const { dataSource } = fakeSource((sql) => {
      if (sql.includes('FROM blob_upload_sessions')) return [session];
      if (sql.includes('FROM blob_records') && sql.includes('FOR UPDATE')) return [];
      if (sql.includes('SELECT * FROM blob_objects')) {
        return [{ id: 'object-doomed', ref_count: 0, gc_in_progress: 1, object_key: session.object_key }];
      }
      return { affectedRows: 1 };
    });
    await expect(service(dataSource).instance.commitUpload(owner, 'upload-1', {}))
      .rejects.toMatchObject({ code: 'BLOB_STORAGE_UNAVAILABLE' });
  });

  it('returns the existing blob for a repeated commit', async () => {
    const { dataSource, calls } = fakeSource((sql) => {
      if (sql.includes('FROM blob_upload_sessions')) return [{ ...session, status: 'committed', committed_blob_id: 'blob-done' }];
      if (sql.includes('SELECT r.*,o.object_key FROM blob_records r JOIN blob_objects o')) {
        return [{ id: 'blob-done', namespace: 'default', blob_key: 'cover.png', owner_type: 'user', owner_id: '17',
          file_name: 'cover.png', mime_type: 'image/png', size_bytes: '4', sha256: hashOf('data'), visibility: 'private',
          metadata_json: null, tags_json: null, ref_type: null, ref_id: null, expires_at: null,
          created_at: new Date(), updated_at: new Date(), object_key: session.object_key }];
      }
      return { affectedRows: 1 };
    });
    const { instance } = service(dataSource);

    await expect(instance.commitUpload(owner, 'upload-1', {})).resolves.toMatchObject({ committed: true });
    expect(calls.some(([sql]) => sql.includes('INSERT INTO blob_records'))).toBe(false);
  });
});

describe('BlobsService reads and visibility', () => {
  const blobId = '11111111-1111-4111-8111-111111111111';
  const row = {
    id: blobId, namespace: 'default', blob_key: 'cover.png', owner_type: 'user', owner_id: '17',
    file_name: 'cover.png', mime_type: 'image/png', size_bytes: '4', sha256: hashOf('data'), visibility: 'private',
    metadata_json: null, tags_json: null, ref_type: null, ref_id: null, expires_at: null,
    created_at: new Date(), updated_at: new Date(), object_key: 'blobs/default/' + 'a'.repeat(32) + '/00000000-0000-4000-8000-000000000000',
  };

  it('hides another owner private blob behind the same 404 as a missing one', async () => {
    const { dataSource } = fakeSource(() => [row]);
    const { instance } = service(dataSource);

    await expect(instance.getBlob(BlobsService.userOwner(18), blobId)).rejects.toMatchObject({ code: 'BLOB_NOT_FOUND' });
    await expect(instance.getBlob(null, blobId)).rejects.toMatchObject({ code: 'BLOB_NOT_FOUND' });
  });

  it('exposes a public blob to anyone, including anonymous callers', async () => {
    const { dataSource } = fakeSource(() => [{ ...row, visibility: 'public' }]);
    const { instance } = service(dataSource);

    await expect(instance.getBlob(null, blobId)).resolves.toMatchObject({ id: blobId, visibility: 'public' });
    await expect(instance.getBlob(BlobsService.userOwner(18), blobId)).resolves.toMatchObject({ id: blobId });
  });

  it('rejects malformed blob ids without querying', async () => {
    const { dataSource, calls } = fakeSource(() => []);
    const { instance } = service(dataSource);
    await expect(instance.getBlob(owner, 'not-a-uuid')).rejects.toMatchObject({ code: 'BLOB_NOT_FOUND' });
    expect(calls.every(([sql]) => !sql.includes('FROM blob_records'))).toBe(true);
  });

  it('pages by created_at and id, and exposes an opaque cursor only when more remain', async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({ ...row, id: `11111111-1111-4111-8111-11111111111${index}` }));
    const { dataSource, calls } = fakeSource(() => rows);
    const { instance } = service(dataSource);

    const page = await instance.listBlobs(owner, { limit: 2 });
    expect(page).toHaveLength(2);
    expect((page as any).__v1NextCursor).toEqual(expect.any(String));
    expect(calls[0][0]).toContain('ORDER BY created_at DESC, id DESC');
    expect(calls[0][1]).toContain(3);

    const last = await instance.listBlobs(owner, { limit: 5 });
    expect((last as any).__v1NextCursor).toBeNull();
  });

  it('applies namespace and business reference filters', async () => {
    const { dataSource, calls } = fakeSource(() => []);
    const { instance } = service(dataSource);
    await instance.listBlobs(owner, { namespace: 'gallery', ref_type: 'post', ref_id: '123' });

    expect(calls[0][0]).toContain('namespace=?');
    expect(calls[0][0]).toContain('ref_type=?');
    expect(calls[0][0]).toContain('ref_id=?');
    expect(calls[0][1]).toEqual(['user', '17', 'gallery', 'post', '123', 31]);
  });
});

describe('BlobsService writes', () => {
  it('renames a blob but refuses to collide with another live key', async () => {
    const clash = fakeSource((sql) => {
      if (sql.includes('FROM blob_records') && sql.includes('FOR UPDATE') && sql.includes('id<>?')) return [{ id: 'other' }];
      return [{ id: 'blob-1', blob_key: 'old.png', namespace: 'default', visibility: 'private', file_name: 'a.png' }];
    });
    await expect(service(clash.dataSource).instance.updateBlob(owner, 'blob-1', { key: 'taken.png' }, {}))
      .rejects.toMatchObject({ code: 'BLOB_KEY_CONFLICT' });
  });

  it('releases the object reference on delete so the bytes can be reclaimed later', async () => {
    const { dataSource, calls } = fakeSource((sql) => {
      if (sql.includes('FROM blob_records') && sql.includes('FOR UPDATE')) return [{ id: 'blob-1', object_id: 'object-1' }];
      if (sql.includes('SELECT id,ref_count FROM blob_objects')) return [{ id: 'object-1', ref_count: 1 }];
      return { affectedRows: 1 };
    });
    const { instance } = service(dataSource);

    await expect(instance.deleteBlob(owner, 'blob-1', {})).resolves.toEqual({ id: 'blob-1', deleted: true });
    expect(calls.some(([sql, parameters]) => sql.includes('SET ref_count=?') && parameters[0] === 0 && parameters[2] === 24)).toBe(true);
    // Bytes are never unlinked inline: the grace period is what protects a
    // concurrent re-upload of the same content.
    expect(calls.some(([sql]) => sql.includes('DELETE FROM blob_objects'))).toBe(false);
  });

  it('reports a missing blob on delete instead of succeeding silently', async () => {
    const { dataSource } = fakeSource(() => []);
    await expect(service(dataSource).instance.deleteBlob(owner, 'blob-1', {})).rejects.toMatchObject({ code: 'BLOB_NOT_FOUND' });
  });
});

describe('BlobsService quota and account deletion', () => {
  it('counts pending uploads as reserved space so parallel uploads cannot overshoot', async () => {
    const { dataSource } = fakeSource((sql) => {
      if (sql.includes('COALESCE(SUM(size_bytes),0) AS used_bytes')) return [{ used_bytes: 0 }];
      if (sql.includes('AS reserved_bytes')) return [{ reserved_bytes: 500 }];
      if (sql.includes('FROM blob_objects')) return [];
      return { affectedRows: 1 };
    });
    const { instance } = service(dataSource, {
      getCached: (key: string) => key === 'blobs_enabled' ? 'true'
        : key === 'blobs_owner_quota_bytes' ? '1000' : '/srv/blobs',
    });

    await expect(instance.createUpload(owner, { ...baseInput, size_bytes: 600 }, {})).rejects.toMatchObject({ code: 'BLOB_QUOTA_EXCEEDED' });
  });

  it('limits how many sessions one owner may keep open', async () => {
    const { dataSource } = fakeSource((sql) => {
      if (sql.includes('COALESCE(SUM(size_bytes),0) AS used_bytes')) return [{ used_bytes: 0 }];
      if (sql.includes('AS reserved_bytes')) return [{ reserved_bytes: 0 }];
      if (sql.includes('COUNT(*) AS count FROM blob_upload_sessions')) return [{ count: 20 }];
      if (sql.includes('FROM blob_objects')) return [];
      return { affectedRows: 1 };
    });
    await expect(service(dataSource).instance.createUpload(owner, baseInput, {}))
      .rejects.toMatchObject({ code: 'BLOB_UPLOAD_LIMIT_REACHED' });
  });

  it('releases each object once per binding when an account is erased', async () => {
    const { dataSource, calls } = fakeSource((sql) => {
      if (sql.includes('FROM blob_records') && sql.includes('FOR UPDATE')) {
        // Two bindings share one object; the release must count both.
        return [{ id: 'blob-1', object_id: 'object-shared' }, { id: 'blob-2', object_id: 'object-shared' }];
      }
      if (sql.includes('SELECT id,ref_count FROM blob_objects')) return [{ id: 'object-shared', ref_count: 2 }];
      if (sql.includes('UPDATE blob_upload_sessions')) return { affectedRows: 3 };
      return { affectedRows: 1 };
    });
    const { instance } = service(dataSource);

    await expect(instance.markUserDataDeleted(17)).resolves.toEqual({ records: 2, objects: 1, uploads: 3 });
    const release = calls.find(([sql]) => sql.includes('SET ref_count=?'));
    expect(release?.[1][0]).toBe(0);
  });

  it('is safe to repeat once the account has no blobs left', async () => {
    const { dataSource, calls } = fakeSource((sql) => {
      if (sql.includes('FROM blob_records') && sql.includes('FOR UPDATE')) return [];
      if (sql.includes('UPDATE blob_upload_sessions')) return { affectedRows: 0 };
      return { affectedRows: 1 };
    });
    await expect(service(dataSource).instance.markUserDataDeleted(17)).resolves.toEqual({ records: 0, objects: 0, uploads: 0 });
    expect(calls.some(([sql]) => sql.includes('INSERT INTO operation_logs'))).toBe(false);
  });
});

describe('BlobsService maintenance', () => {
  it('expires stale sessions and drops their staged objects', async () => {
    const objectKey = 'blobs/default/' + 'a'.repeat(32) + '/00000000-0000-4000-8000-000000000000';
    const { dataSource, calls } = fakeSource((sql) => {
      if (sql.includes('FROM blob_upload_sessions') && sql.includes('object_deleted_at IS NULL')) {
        return [{ id: 'upload-1', object_key: objectKey, status: 'pending' }];
      }
      if (sql.includes('FROM blob_objects') && sql.includes('pending_delete_at<=NOW()')) return [];
      if (sql.includes('FROM blob_records') && sql.includes('expires_at<=NOW()')) return [];
      return { affectedRows: 1 };
    });
    const { instance, storage } = service(dataSource);

    const result = await instance.runMaintenance();
    expect(result.expiredUploads).toBe(1);
    expect(storage.deleteObject).toHaveBeenCalledWith(objectKey);
    expect(calls.some(([sql]) => sql.includes("SET status='expired'"))).toBe(true);
  });

  it('claims an unreferenced object before deleting it, and clears the claim when deletion fails', async () => {
    const { dataSource, calls } = fakeSource((sql) => {
      if (sql.includes('FROM blob_objects') && sql.includes('pending_delete_at<=NOW()')) {
        return [{ id: 'object-1', object_key: 'blobs/default/' + 'a'.repeat(32) + '/00000000-0000-4000-8000-000000000000' }];
      }
      if (sql.includes('COUNT(*) AS count FROM blob_records')) return [{ count: 0 }];
      if (sql.includes('SELECT id,ref_count,gc_in_progress FROM blob_objects')) return [{ id: 'object-1', ref_count: 0, gc_in_progress: 1 }];
      if (sql.includes('FROM blob_upload_sessions')) return [];
      if (sql.includes('FROM blob_records')) return [];
      return { affectedRows: 1 };
    });
    const { instance, storage } = service(dataSource);

    await expect(instance.runMaintenance()).resolves.toMatchObject({ deletedObjects: 1 });
    expect(calls.some(([sql]) => sql.includes('SET gc_in_progress=1'))).toBe(true);
    expect(calls.some(([sql]) => sql.includes('DELETE FROM blob_objects'))).toBe(true);

    // A storage failure must hand the object back to the next sweep.
    const failing = fakeSource((sql) => {
      if (sql.includes('FROM blob_objects') && sql.includes('pending_delete_at<=NOW()')) {
        return [{ id: 'object-1', object_key: 'blobs/default/' + 'a'.repeat(32) + '/00000000-0000-4000-8000-000000000000' }];
      }
      if (sql.includes('FROM blob_upload_sessions')) return [];
      if (sql.includes('FROM blob_records')) return [];
      return { affectedRows: 1 };
    });
    const failingService = service(failing.dataSource);
    failingService.storage.deleteObject.mockRejectedValueOnce(new Error('disk offline'));
    await failingService.instance.runMaintenance();
    expect(failing.calls.some(([sql]) => sql.includes('gc_in_progress=0,pending_delete_at='))).toBe(true);
    void storage;
  });

  it('keeps a still-referenced object when a revival raced the sweep', async () => {
    const { dataSource, calls } = fakeSource((sql) => {
      if (sql.includes('FROM blob_objects') && sql.includes('pending_delete_at<=NOW()')) {
        return [{ id: 'object-1', object_key: 'blobs/default/' + 'a'.repeat(32) + '/00000000-0000-4000-8000-000000000000' }];
      }
      if (sql.includes('COUNT(*) AS count FROM blob_records')) return [{ count: 1 }];
      if (sql.includes('SELECT id,ref_count,gc_in_progress FROM blob_objects')) return [{ id: 'object-1', ref_count: 1, gc_in_progress: 1 }];
      if (sql.includes('FROM blob_upload_sessions')) return [];
      if (sql.includes('FROM blob_records')) return [];
      return { affectedRows: 1 };
    });
    const { instance } = service(dataSource);

    await instance.runMaintenance();
    expect(calls.some(([sql]) => sql.includes('DELETE FROM blob_objects'))).toBe(false);
    expect(calls.some(([sql]) => sql.includes('SET gc_in_progress=0 WHERE id=?'))).toBe(true);
  });

  it('does nothing when storage is not configured', async () => {
    const { dataSource, calls } = fakeSource(() => []);
    const { instance, storage } = service(dataSource);
    storage.isConfigured = () => false;
    await expect(instance.runMaintenance()).resolves.toEqual({
      expiredUploads: 0, orphanObjects: 0, expiredBlobs: 0, deletedObjects: 0, expiredIdempotencyKeys: 0,
    });
    expect(calls).toHaveLength(0);
  });
});

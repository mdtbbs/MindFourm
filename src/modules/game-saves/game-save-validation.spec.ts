import { decodeSaveCursor, encodeSaveCursor, normalizeCloudSaveName, normalizeSaveMetadata, shouldCreateConflictCopy } from './game-save-validation';

describe('cloud save validation', () => {
  it('creates a conflict copy only when the current head diverged from the upload base', () => {
    expect(shouldCreateConflictCopy('create_conflict_copy', true)).toBe(true);
    expect(shouldCreateConflictCopy('create_conflict_copy', false)).toBe(false);
    expect(shouldCreateConflictCopy('normal', true)).toBe(false);
  });

  it('normalizes slot names and rejects blank or overlong values', () => {
    expect(normalizeCloudSaveName('  Salt Flats  ')).toBe('Salt Flats');
    expect(() => normalizeCloudSaveName('   ')).toThrow();
    expect(() => normalizeCloudSaveName('x'.repeat(101))).toThrow();
  });

  it('canonicalizes mod manifests before hashing', () => {
    const first = normalizeSaveMetadata({ mods: [{ id: 'z', version: '1' }, { id: 'a', version: '2' }] }, 10, 4096);
    const second = normalizeSaveMetadata({ mods: [{ id: 'a', version: '2' }, { id: 'z', version: '1' }] }, 10, 4096);
    expect(first.mods_manifest_json).toEqual([
      { id: 'a', name: null, version: '2', sha256: null },
      { id: 'z', name: null, version: '1', sha256: null },
    ]);
    expect(first.mods_manifest_hash).toBe(second.mods_manifest_hash);
  });

  it('rejects oversized manifests and invalid mod hashes', () => {
    expect(() => normalizeSaveMetadata({ mods: [{ id: 'a'.repeat(100) }] }, 10, 10)).toThrow();
    expect(() => normalizeSaveMetadata({ mods: [{ sha256: 'not-a-hash' }] }, 10, 4096)).toThrow();
    expect(() => normalizeSaveMetadata({ mods: [{ id: 'x' }] }, 0, 4096)).toThrow();
  });

  it('round trips an opaque cursor and rejects malformed cursors', () => {
    const cursor = encodeSaveCursor('2026-10-01T12:30:00.000Z', 'f85bde9d-4e6f-4cd9-a3ed-aac9d841d8b1');
    expect(decodeSaveCursor(cursor)).toEqual({ updated_at: '2026-10-01T12:30:00.000Z', id: 'f85bde9d-4e6f-4cd9-a3ed-aac9d841d8b1' });
    expect(() => decodeSaveCursor('not-a-cursor')).toThrow();
  });

  it('rejects cursors whose id is not a UUID', () => {
    const encode = (id: string, updatedAt = '2026-10-01T12:30:00.000Z') =>
      Buffer.from(JSON.stringify({ updated_at: updatedAt, id }), 'utf8').toString('base64url');
    expect(() => decodeSaveCursor(encode('-'.repeat(36)))).toThrow();
    expect(() => decodeSaveCursor(encode('f85bde9d-4e6f-1cd9-a3ed-aac9d841d8b1'))).toThrow();
    expect(() => decodeSaveCursor(encode('f85bde9d-4e6f-4cd9-03ed-aac9d841d8b1'))).toThrow();
  });
});

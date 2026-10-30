import {
  decodeSaveCursor, encodeSaveCursor, normalizeCloudSaveName, normalizeHashList,
  normalizeManifest, normalizeSaveMetadata, shouldCreateConflictCopy,
} from './game-save-validation';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

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

  it('accepts a well-formed manifest and hashes files in path order', () => {
    const first = normalizeManifest({ files: [{ path: 'saves/0.msav', size: 10, sha256: HASH_A }, { path: 'settings.bin', size: 5, sha256: HASH_B }] }, 10, 1024, 4096);
    const second = normalizeManifest({ files: [{ path: 'settings.bin', size: 5, sha256: HASH_B }, { path: 'saves/0.msav', size: 10, sha256: HASH_A }] }, 10, 1024, 4096);
    expect(first.total_size).toBe(15);
    expect(first.files).toHaveLength(2);
    expect(first.manifest_hash).toBe(second.manifest_hash);
  });

  it('rejects manifest path traversal, absolute paths, duplicates and Windows separators', () => {
    for (const path of ['../escape', 'saves/../../x', '/etc/passwd', 'saves\\0.msav', 'C:/save', 'a//b', './a', 'a/']) {
      expect(() => normalizeManifest({ files: [{ path, size: 1, sha256: HASH_A }] }, 10, 1024, 4096)).toThrow();
    }
    expect(() => normalizeManifest({ files: [
      { path: 'saves/0.msav', size: 1, sha256: HASH_A },
      { path: 'saves/0.msav', size: 2, sha256: HASH_B },
    ] }, 10, 1024, 4096)).toThrow();
  });

  it('enforces manifest file-count, per-file and serialized-size limits', () => {
    const files = (count: number) => Array.from({ length: count }, (_, index) => ({ path: `saves/${index}.msav`, size: 1, sha256: HASH_A }));
    expect(() => normalizeManifest({ files: files(3) }, 2, 1024, 4096)).toThrow();
    expect(() => normalizeManifest({ files: [{ path: 'saves/0.msav', size: 2048, sha256: HASH_A }] }, 10, 1024, 4096)).toThrow();
    expect(() => normalizeManifest({ files: files(2) }, 10, 1024, 10)).toThrow();
  });

  it('normalizes SHA-256 lists and rejects malformed or oversized input', () => {
    expect(normalizeHashList([HASH_A, HASH_B, HASH_A, HASH_B], 10)).toEqual([HASH_A, HASH_B]);
    expect(normalizeHashList([], 10)).toEqual([]);
    expect(() => normalizeHashList(['not-a-hash'], 10)).toThrow();
    expect(() => normalizeHashList([HASH_A, HASH_B], 1)).toThrow();
  });

  it('rejects cursors whose id is not a UUID', () => {
    const encode = (id: string, updatedAt = '2026-10-01T12:30:00.000Z') =>
      Buffer.from(JSON.stringify({ updated_at: updatedAt, id }), 'utf8').toString('base64url');
    expect(() => decodeSaveCursor(encode('-'.repeat(36)))).toThrow();
    expect(() => decodeSaveCursor(encode('f85bde9d-4e6f-1cd9-a3ed-aac9d841d8b1'))).toThrow();
    expect(() => decodeSaveCursor(encode('f85bde9d-4e6f-4cd9-03ed-aac9d841d8b1'))).toThrow();
  });
});

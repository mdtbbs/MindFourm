import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateOneResourceFile, parseMigrationOptions, runResourceStorageMigration } from './resource-storage-migrate';

describe('resource storage migration', () => {
  let directory: string;
  let source: string;
  const bytes = Buffer.from('legacy resource bytes');
  const sha256 = '83823c3a7e1298cbcc8d2446eb7bc84e1a49cd2185c46b06b08d1652885c9ad6';

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'res-migrate-test-'));
    source = join(directory, 'map.msav');
    await writeFile(source, bytes);
  });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  const file = () => ({
    id: 7, public_id: 'file-7', storage_backend: 'managed', storage_key: '/managed/map.msav',
    provider_file_id: null, provider_object_id: null, provider_binding_id: null,
    original_filename: 'map.msav', display_name: 'map.msav', mime_type: 'application/octet-stream',
    size_bytes: bytes.length, content_hash: null, hash_algorithm: null,
    availability_status: 'available', resource_status: 'approved', version_status: 'published', resource_public: 1,
    resource_visibility: 'public',
  }) as any;
  const storage = () => ({ statManagedFile: jest.fn().mockImplementation(async () => ({ path: source, size: bytes.length })) }) as any;
  const client = () => ({
    uploadServerGeneratedObject: jest.fn().mockResolvedValue({ public_id: 'res-public', state: 'verified', sha256, size_bytes: bytes.length, mime_type: 'application/octet-stream' }),
    getObject: jest.fn().mockResolvedValue({ public_id: 'res-public', state: 'verified', sha256, size_bytes: bytes.length, mime_type: 'application/octet-stream' }),
    createBinding: jest.fn().mockResolvedValue({ id: 'binding-7' }),
    deleteBinding: jest.fn().mockResolvedValue(undefined),
  }) as any;
  const db = (record: any, visibility = 'public') => ({ transaction: jest.fn().mockImplementation(async (work) => work({
    query: jest.fn().mockResolvedValue([{ resource_status: 'approved', resource_public: 1, resource_visibility: visibility, version_status: 'published' }]),
    findOne: jest.fn().mockResolvedValue(record), save: jest.fn().mockResolvedValue(record),
  })) }) as any;

  it('validates bounded CLI options', () => {
    expect(parseMigrationOptions(['--dry-run', '--backend=mfl', '--limit=2', '--resource-id=17']))
      .toEqual({ dryRun: true, backend: 'mfl', limit: 2, resourceId: 17 });
    expect(() => parseMigrationOptions(['--limit=0'])).toThrow();
    expect(() => parseMigrationOptions(['--backend=external'])).toThrow();
  });

  it('dry-run checks bytes but does not write RES or the database', async () => {
    const remote = client();
    const database = db(file());
    expect(await migrateOneResourceFile(database, file(), remote, storage(), {} as any, true)).toBe('planned');
    expect(remote.uploadServerGeneratedObject).not.toHaveBeenCalled();
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('uploads, verifies, binds and atomically changes one managed file', async () => {
    const old = file();
    const remote = client();
    const database = db(old);
    expect(await migrateOneResourceFile(database, old, remote, storage(), {} as any, false)).toBe('migrated');
    expect(remote.createBinding).toHaveBeenCalledWith('res-public', expect.objectContaining({ visibility: 'public', owner_id: 'file-7' }));
    expect(old).toMatchObject({ storage_backend: 'res', provider_object_id: 'res-public', provider_binding_id: 'binding-7', integrity_status: 'verified' });
    expect(old.provider_file_id).toBeNull();
  });

  it('keeps an explicitly private resource private during historical migration', async () => {
    const old = file();
    const remote = client();
    const database = db(old, 'private');
    expect(await migrateOneResourceFile(database, old, remote, storage(), {} as any, false)).toBe('migrated');
    expect(remote.createBinding).toHaveBeenCalledWith('res-public', expect.objectContaining({ visibility: 'private', owner_id: 'file-7' }));
  });

  it('leaves the historical row unchanged when RES upload fails', async () => {
    const old = file();
    const remote = client();
    remote.uploadServerGeneratedObject.mockRejectedValue(new Error('RES unavailable'));
    const database = db(old);
    await expect(migrateOneResourceFile(database, old, remote, storage(), {} as any, false)).rejects.toThrow('RES unavailable');
    expect(old.storage_backend).toBe('managed');
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('skips already migrated files and continues after an individual failure', async () => {
    const one = file();
    const two = { ...file(), id: 8, storage_key: null };
    const third = { ...file(), id: 9, storage_backend: 'res' };
    const query = {
      innerJoin: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [one, two, third], raw: [{ resource_status: 'approved', version_status: 'published', resource_visibility: 'public' }, {}, {}] }),
    };
    const database = { getRepository: () => ({ createQueryBuilder: () => query }) } as any;
    const result = await runResourceStorageMigration(database, client(), storage(), {} as any, { dryRun: true, backend: 'managed', limit: 3 });
    expect(result).toMatchObject({ scanned: 3, planned: 1, failed: 1, skipped: 1 });
    expect(result.errors[0].file_id).toBe(8);
  });
});

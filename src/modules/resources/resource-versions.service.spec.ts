import { ConflictException } from '@nestjs/common';
import { Resource } from '@entities/resource.entity';
import { ResourceFile } from '@entities/resource-file.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { ResourceVersionService } from './resource-versions.service';

describe('ResourceVersionService', () => {
  const file = {
    file_name: 'release.zip', file_path: '/quarantine/release.zip', file_size: 123,
    mime_type: 'application/zip', content_hash: 'a'.repeat(64),
  };
  const resource = { id: 7, user_id: 9, status: 'approved', resource_kind: 'other', source_url: null, title: 'Resource' };

  it('limits legacy version listings and direct downloads to published versions for public viewers', async () => {
    const { service, versionRepository } = setup();
    const rows = [
      { id: 22, resource_id: 7, version: '2.0.0', status: 'pending_review' },
      { id: 21, resource_id: 7, version: '1.0.0', status: 'published' },
    ];
    versionRepository.find.mockImplementation(async ({ where }: any) =>
      rows.filter((row) => !where?.status || row.status === where.status));
    versionRepository.findOne.mockResolvedValue(rows[0]);

    await expect(service.list(7)).resolves.toEqual([expect.objectContaining({ status: 'published' })]);
    await expect(service.getDownloadTarget(7, 22)).rejects.toThrow('版本不存在');
    await expect(service.list(7, { id: 9, role: 'user' })).resolves.toHaveLength(2);
    await expect(service.getDownloadTarget(7, 22, { id: 9, role: 'user' })).resolves.toEqual(rows[0]);
  });

  function setup(options: { exact?: boolean; claimError?: Error; existingRevision?: number } = {}) {
    const manager = {
      save: jest.fn(async (entity: unknown, value: any) => entity === ResourceVersion ? { ...value, id: 31 } : value),
      update: jest.fn(),
      create: jest.fn((_entity: unknown, value: any) => value),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT id,user_id FROM resources')) return [{ id: 7, user_id: 9 }];
        if (sql.includes('MAX(revision)')) return [{ max_revision: options.existingRevision || 0 }];
        return [];
      }),
    };
    const versionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value) => value),
      manager: { transaction: jest.fn((callback) => callback(manager)), query: jest.fn().mockResolvedValue([]) },
    };
    const resourceRepository = { findOne: jest.fn().mockResolvedValue(resource) };
    const resourcesService = {
      claimResourceVersionHash: jest.fn(async () => { if (options.claimError) throw options.claimError; }),
      releaseContentHashClaim: jest.fn(),
    };
    const duplicateService = {
      inspect: jest.fn().mockResolvedValue({ exact: Boolean(options.exact), existing_resources: [] }),
    };
    return {
      service: new ResourceVersionService(
        versionRepository as any, resourceRepository as any,
        resourcesService as any, duplicateService as any,
      ),
      manager, versionRepository, resourcesService, duplicateService,
    };
  }

  it('rechecks the exact file hash, claims it in the write transaction, and creates the version attachment atomically', async () => {
    const { service, manager, versionRepository, resourcesService, duplicateService } = setup();

    await expect(service.create({ resource_id: 7, version: '1.2.0' }, file, 9)).resolves.toMatchObject({ id: 31 });

    expect(duplicateService.inspect).toHaveBeenCalledWith(expect.objectContaining({ contentHash: file.content_hash }));
    expect(resourcesService.claimResourceVersionHash).toHaveBeenCalledWith(manager, file.content_hash, 7);
    expect(manager.save).toHaveBeenNthCalledWith(2, ResourceFile, expect.objectContaining({
      resource_version_id: 31,
      content_hash: file.content_hash,
      availability_status: 'available',
    }));
    expect(versionRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'pending_review', published_at: null, recommended: 0,
    }));
    expect(manager.update).not.toHaveBeenCalledWith(Resource, 7, expect.anything());
    expect(manager.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event_type: 'release_submitted', result: 'pending_review',
    }));
  });

  it('returns a hard duplicate conflict before creating a version', async () => {
    const { service, manager } = setup({ exact: true });

    await expect(service.create({ resource_id: 7, version: '1.2.0' }, file, 9)).rejects.toBeInstanceOf(ConflictException);

    expect(manager.save).not.toHaveBeenCalled();
  });

  it('propagates the unique hash-claim conflict if another upload wins the final-check race', async () => {
    const { service, manager } = setup({ claimError: new ConflictException({ code: 'RESOURCE_DUPLICATE' }) });

    await expect(service.create({ resource_id: 7, version: '1.2.0' }, file, 9)).rejects.toMatchObject({
      response: { code: 'RESOURCE_DUPLICATE' },
    });

    expect(manager.save).not.toHaveBeenCalled();
  });

  it('creates a new immutable revision when the same version string is uploaded again', async () => {
    const { service, versionRepository, manager } = setup({ existingRevision: 1 });

    await service.create({ resource_id: 7, version: '1.2.0' }, file, 9);

    expect(versionRepository.create).toHaveBeenCalledWith(expect.objectContaining({ version: '1.2.0', revision: 2, status: 'pending_review' }));
    expect(manager.save).toHaveBeenCalledWith(ResourceVersion, expect.objectContaining({ revision: 2 }));
    expect(manager.save).not.toHaveBeenCalledWith(ResourceVersion, expect.objectContaining({ id: 19 }));
    expect(manager.update).not.toHaveBeenCalledWith(Resource, 7, expect.anything());
  });

  it('serializes revision allocation for concurrent uploads of the same version', async () => {
    const savedVersions: Array<{ id: number; revision: number }> = [];
    let nextId = 1;
    let transactionTail = Promise.resolve();
    const manager: any = {
      query: jest.fn(async (sql: string) => sql.includes('MAX(revision)')
        ? [{ max_revision: savedVersions.reduce((max, row) => Math.max(max, row.revision), 0) }]
        : [{ id: 7, user_id: 9 }]),
      create: jest.fn((_entity: unknown, value: any) => value),
      save: jest.fn(async (entity: unknown, value: any) => {
        if (entity === ResourceVersion) {
          const row = { ...value, id: nextId++ };
          savedVersions.push({ id: row.id, revision: row.revision });
          return row;
        }
        return value;
      }),
      update: jest.fn(),
    };
    const versionRepository: any = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      manager: {
        transaction: async (callback: (manager: any) => Promise<unknown>) => {
          const previous = transactionTail;
          let release!: () => void;
          transactionTail = new Promise<void>((resolve) => { release = resolve; });
          await previous;
          try { return await callback(manager); } finally { release(); }
        },
      },
    };
    const service = new ResourceVersionService(
      versionRepository, { findOne: jest.fn().mockResolvedValue(resource) } as any,
      { claimResourceVersionHash: jest.fn(), releaseContentHashClaim: jest.fn() } as any,
      { inspect: jest.fn().mockResolvedValue({ exact: false, existing_resources: [] }) } as any,
    );

    await Promise.all([
      service.create({ resource_id: 7, version: '1.2.0' }, { ...file, content_hash: 'a'.repeat(64) }, 9),
      service.create({ resource_id: 7, version: '1.2.0' }, { ...file, content_hash: 'b'.repeat(64) }, 9),
    ]);

    expect(savedVersions.map((row) => row.revision).sort()).toEqual([1, 2]);
    expect(manager.query.mock.calls.filter(([sql]: [string]) => sql.includes('FOR UPDATE'))).toHaveLength(2);
    expect(versionRepository.create).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: 'pending_review', published_at: null }));
  });
});

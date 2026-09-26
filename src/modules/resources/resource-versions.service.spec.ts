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
  const resource = { id: 7, user_id: 9, status: 'approved', resource_kind: 'mod', source_url: null, title: 'Mod' };

  function setup(options: { exact?: boolean; claimError?: Error } = {}) {
    const manager = {
      save: jest.fn(async (entity: unknown, value: any) => entity === ResourceVersion ? { ...value, id: 31 } : value),
      update: jest.fn(),
    };
    const versionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      manager: { transaction: jest.fn((callback) => callback(manager)) },
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
    const { service, manager, resourcesService, duplicateService } = setup();

    await expect(service.create({ resource_id: 7, version: '1.2.0' }, file, 9)).resolves.toMatchObject({ id: 31 });

    expect(duplicateService.inspect).toHaveBeenCalledWith(expect.objectContaining({ contentHash: file.content_hash }));
    expect(resourcesService.claimResourceVersionHash).toHaveBeenCalledWith(manager, file.content_hash, 7);
    expect(manager.save).toHaveBeenNthCalledWith(2, ResourceFile, expect.objectContaining({
      resource_version_id: 31,
      content_hash: file.content_hash,
      availability_status: 'available',
    }));
    expect(manager.update).toHaveBeenCalledWith(Resource, 7, { status: 'pending' });
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
});

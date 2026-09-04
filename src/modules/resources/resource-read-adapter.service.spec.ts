import { ResourceReadAdapterService } from './resource-read-adapter.service';
import { ResourceLegacyProjectionService } from './resource-legacy-projection.service';

describe('ResourceLegacyProjectionService', () => {
  const service = new ResourceLegacyProjectionService();

  it('uses description when available', () => {
    const result = service.projectToLegacy({
      id: 1, title: 'Test', description: 'Original desc', summary: 'New summary',
      version: '1.0', resource_type: 'upload', download_count: 10,
    });
    expect(result.description).toBe('Original desc');
  });

  it('falls back to summary when description is empty', () => {
    const result = service.projectToLegacy({
      id: 1, title: 'Test', description: '', summary: 'New summary',
      version: '1.0', resource_type: 'upload', download_count: 10,
    });
    expect(result.description).toBe('New summary');
  });

  it('shows 版本未知 for blank version', () => {
    const result = service.projectToLegacy({
      id: 1, title: 'Test', description: 'Desc', version: '',
      resource_type: 'upload', download_count: 0,
    });
    expect(result.version).toBe('版本未知');
  });

  it('shows 版本未知 for legacy-{id} pattern', () => {
    const result = service.projectToLegacy({
      id: 5, title: 'Test', description: 'Desc', version: 'legacy-5',
      resource_type: 'upload', download_count: 0,
    });
    expect(result.version).toBe('版本未知');
  });

  it('uses the real version when present', () => {
    const result = service.projectToLegacy({
      id: 1, title: 'Test', description: 'Desc', version: '2.1.0',
      resource_type: 'upload', download_count: 0,
    });
    expect(result.version).toBe('2.1.0');
  });
});

describe('ResourceReadAdapterService', () => {
  it('returns null for non-existent resources', async () => {
    const resourceRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new ResourceReadAdapterService(
      resourceRepo as any, {} as any, {} as any, {} as any,
      new ResourceLegacyProjectionService(),
    );

    const result = await service.getResourceV1(999);
    expect(result).toBeNull();
  });

  it('returns null for non-public resources', async () => {
    const resourceRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 1, is_public: 0 }),
    };
    const service = new ResourceReadAdapterService(
      resourceRepo as any, {} as any, {} as any, {} as any,
      new ResourceLegacyProjectionService(),
    );

    const result = await service.getResourceV1(1);
    expect(result).toBeNull();
  });

  it('builds a V1 DTO with attributions and versions', async () => {
    const resourceRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 1, title: 'Test Resource', is_public: 1, deleted_at: null,
        public_id: 'abc-123', summary: 'A summary', description: 'Full desc',
        resource_kind: 'mod', visibility: null,
        latest_published_version_id: 10, download_count: 42,
      }),
    };
    const versionRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 10, resource_id: 1, version: '1.0', public_id: 'ver-abc', status: 'published', is_legacy_root_release: true, created_at: new Date() },
      ]),
    };
    const attributionRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 1, resource_id: 1, role: 'submitter', subject_type: 'local_user', display_name: null, user_id: 42, sort_order: 0 },
      ]),
    };
    const fileRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 1, resource_version_id: 10, public_id: 'file-abc', role: 'primary',
          delivery_mode: 'managed', display_name: 'mod.jar',
          integrity_status: 'verified', availability_status: 'available', sort_order: 0,
        },
      ]),
    };

    const service = new ResourceReadAdapterService(
      resourceRepo as any, versionRepo as any, attributionRepo as any, fileRepo as any,
      new ResourceLegacyProjectionService(),
    );

    const result = await service.getResourceV1(1);

    expect(result).not.toBeNull();
    expect(result!.public_id).toBe('abc-123');
    expect(result!.title).toBe('Test Resource');
    expect(result!.summary).toBe('A summary');
    expect(result!.download_count).toBe(42);
    expect(result!.attributions).toHaveLength(1);
    expect(result!.attributions[0].role).toBe('submitter');
    expect(result!.latest_version).not.toBeNull();
    expect(result!.latest_version!.files).toHaveLength(1);
    expect(result!.latest_version!.files[0].installable).toBe(true);
  });
});

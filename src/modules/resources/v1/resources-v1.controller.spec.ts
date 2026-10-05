import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { API_V1_CONTRACT } from '../../../common/decorators/api-v1.decorator';
import { ResourcesV1Controller } from './resources-v1.controller';

describe('ResourcesV1Controller', () => {
  it('is marked as a V1 controller', () => {
    expect(Reflect.getMetadata(API_V1_CONTRACT, ResourcesV1Controller)).toBe(true);
  });

  it('returns RESOURCE_V1_DISABLED when capability is off', async () => {
    const capabilities = { getCapabilities: jest.fn().mockResolvedValue({ resource_read: false }) };
    const adapter = { getResourceByPublicId: jest.fn() };
    const controller = new ResourcesV1Controller(capabilities as any, adapter as any);

    await expect(controller.getResource('resource-id')).rejects.toThrow();

    try {
      await controller.getResource('resource-id');
    } catch (e: any) {
      expect(e.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(e.code).toBe('RESOURCE_V1_DISABLED');
    }
  });

  it('returns RESOURCE_NOT_FOUND when adapter returns null', async () => {
    const capabilities = { getCapabilities: jest.fn().mockResolvedValue({ resource_read: true }) };
    const adapter = { getResourceByPublicId: jest.fn().mockResolvedValue(null) };
    const controller = new ResourcesV1Controller(capabilities as any, adapter as any);

    try {
      await controller.getResource('missing-resource');
    } catch (e: any) {
      expect(e.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(e.code).toBe('RESOURCE_NOT_FOUND');
    }
  });

  it('returns a V1ResourceDetail when resource is found', async () => {
    const capabilities = { getCapabilities: jest.fn().mockResolvedValue({ resource_read: true }) };
    const adapter = {
      getResourceByPublicId: jest.fn().mockResolvedValue({
        public_id: 'abc', id: 1, title: 'Test', summary: 'A summary',
        resource_kind: 'mod', visibility: 'public', metadata: { schema_version: 1, tags: [], supported_versions: [], compatibility: [], preview: { url: null, status: 'none' } }, download_count: 42,
        latest_version: {
          public_id: 'ver', id: 10, version: '1.0', display_version: '1.0',
          status: 'published', is_legacy_root_release: true,
          files: [{ public_id: 'f1', id: 1, role: 'primary' }],
        },
        attributions: [{ id: 1, role: 'submitter', subject_type: 'local_user', display_name: null, user_id: 42 }],
      }),
    };
    const controller = new ResourcesV1Controller(capabilities as any, adapter as any);

    const result = await controller.getResource('resource-id');

    expect(result.public_id).toBe('abc');
    expect(result.title).toBe('Test');
    expect(result.latest_version).not.toBeNull();
    expect(result.latest_version!.file_count).toBe(1);
    expect(result.attributions).toHaveLength(1);
    expect(result.download_count).toBe(42);
  });

  it('redirects merged public IDs to their canonical V1 resource', async () => {
    const capabilities = { getCapabilities: jest.fn().mockResolvedValue({ resource_read: true }) };
    const adapter = {
      getResourceByPublicId: jest.fn().mockResolvedValue(null),
      getMergedCanonicalPublicId: jest.fn().mockResolvedValue('canonical-id'),
    };
    const response = { status: jest.fn(), setHeader: jest.fn() };
    const controller = new ResourcesV1Controller(capabilities as any, adapter as any);

    await expect(controller.getResource('old-id', response as any)).resolves.toEqual({
      merged: true,
      canonical_public_id: 'canonical-id',
      redirect_url: '/api/v1/resources/canonical-id',
    });
    expect(response.status).toHaveBeenCalledWith(HttpStatus.MOVED_PERMANENTLY);
    expect(response.setHeader).toHaveBeenCalledWith('Location', '/api/v1/resources/canonical-id');
  });

  it('lists public resources through the same capability gate', async () => {
    const capabilities = { getCapabilities: jest.fn().mockResolvedValue({ resource_read: true }) };
    const adapter = { listResourcesV1: jest.fn().mockResolvedValue({ items: [{ public_id: 'resource-2', title: 'Mod' }], pagination: { limit: 20, offset: 0, next_offset: null, has_more: false } }) };
    const controller = new ResourcesV1Controller(capabilities as any, adapter as any);

    await expect(controller.listResources('20', '0', 'mod')).resolves.toMatchObject({ items: [{ public_id: 'resource-2', title: 'Mod' }] });
    expect(adapter.listResourcesV1).toHaveBeenCalledWith({ limit: 20, offset: 0, search: 'mod' });
  });

  it('records V1 file downloads through the shared download grant ledger', async () => {
    const capabilities = { getCapabilities: jest.fn().mockResolvedValue({ resource_read: true, resources: { download: true } }) };
    const adapter = {
      getPublicFileByPublicIds: jest.fn().mockResolvedValue({
        resource: { id: 7 }, version: { id: 12 },
        file: { id: 30, availability_status: 'available', delivery_mode: 'external', external_url: 'https://cdn.example.org/mod.jar' },
      }),
      incrementDownload: jest.fn(),
    };
    const downloadGrant = { recordGrant: jest.fn().mockResolvedValue(true) };
    const controller = new ResourcesV1Controller(capabilities as any, adapter as any, undefined, undefined, downloadGrant as any);
    const response = { redirect: jest.fn() };

    await controller.downloadFile('resource-public-id', 'version-public-id', 'file-public-id', response as any, {
      user: { id: 22 },
      headers: { 'user-agent': 'Example launcher', 'x-client-version': '2.1.0', 'x-platform': 'linux' },
    });

    expect(downloadGrant.recordGrant).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: 7,
      versionId: 12,
      fileId: 30,
      userId: 22,
      clientType: 'public-v1',
      clientVersion: '2.1.0',
      platform: 'linux',
      backend: 'external',
    }), 'user:22');
    expect(adapter.incrementDownload).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith('https://cdn.example.org/mod.jar');
  });

  it('records a RES download grant and redirects without reading file bytes', async () => {
    const capabilities = { getCapabilities: jest.fn().mockResolvedValue({ resource_read: true, resources: { download: true } }) };
    const adapter = { getPublicFileByPublicIds: jest.fn().mockResolvedValue({
      resource: { id: 7, status: 'approved', is_public: 1 }, version: { id: 12, status: 'published' },
      file: { id: 30, storage_backend: 'res', availability_status: 'available' },
    }) };
    const grants = { recordGrant: jest.fn().mockResolvedValue(true) };
    const provider = { getDownloadTarget: jest.fn().mockResolvedValue({ kind: 'redirect', url: 'https://res.example/o/object/file.msav' }) };
    const controller = new ResourcesV1Controller(capabilities as any, adapter as any, undefined, undefined, grants as any, undefined, provider as any);
    const response = { redirect: jest.fn() };

    await controller.downloadFile('resource', 'version', 'file', response as any, { headers: {}, user: { id: 22 } });

    expect(provider.getDownloadTarget).toHaveBeenCalledWith(expect.objectContaining({ storage_backend: 'res' }), { private: false });
    expect(grants.recordGrant).toHaveBeenCalledWith(expect.objectContaining({ backend: 'res', fileId: 30 }), 'user:22');
    expect(response.redirect).toHaveBeenCalledWith('https://res.example/o/object/file.msav');
  });
  it('requests a signed target for an authorized private published RES file', async () => {
    const caps = { getCapabilities: jest.fn().mockResolvedValue({ resource_read: true, resources: { download: true } }) };
    const target = { resource: { id: 7, status: 'approved', is_public: 0 }, version: { id: 12, status: 'published' },
      file: { id: 30, storage_backend: 'res', availability_status: 'available' } };
    const adapter = { getPublicFileByPublicIds: jest.fn().mockResolvedValue(target) };
    const provider = { getDownloadTarget: jest.fn().mockResolvedValue({ kind: 'redirect', url: 'https://res.example/private/short-token' }) };
    const grants = { recordGrant: jest.fn().mockResolvedValue(true) };
    const controller = new ResourcesV1Controller(caps as any, adapter as any, undefined, undefined, grants as any, undefined, provider as any);
    const response = { redirect: jest.fn() };
    await controller.downloadFile('resource', 'version', 'file', response as any, { headers: {}, user: { id: 22 } });
    expect(provider.getDownloadTarget).toHaveBeenCalledWith(target.file, { private: true });
    expect(response.redirect).toHaveBeenCalledWith('https://res.example/private/short-token');
    expect(grants.recordGrant).toHaveBeenCalledTimes(1);
  });

});

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
    const adapter = { getResourceV1: jest.fn() };
    const controller = new ResourcesV1Controller(capabilities as any, adapter as any);

    await expect(controller.getResource(1)).rejects.toThrow();

    try {
      await controller.getResource(1);
    } catch (e: any) {
      expect(e.getStatus()).toBe(HttpStatus.FORBIDDEN);
      expect(e.code).toBe('RESOURCE_V1_DISABLED');
    }
  });

  it('returns RESOURCE_NOT_FOUND when adapter returns null', async () => {
    const capabilities = { getCapabilities: jest.fn().mockResolvedValue({ resource_read: true }) };
    const adapter = { getResourceV1: jest.fn().mockResolvedValue(null) };
    const controller = new ResourcesV1Controller(capabilities as any, adapter as any);

    try {
      await controller.getResource(999);
    } catch (e: any) {
      expect(e.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(e.code).toBe('RESOURCE_NOT_FOUND');
    }
  });

  it('returns a V1ResourceDetail when resource is found', async () => {
    const capabilities = { getCapabilities: jest.fn().mockResolvedValue({ resource_read: true }) };
    const adapter = {
      getResourceV1: jest.fn().mockResolvedValue({
        public_id: 'abc', id: 1, title: 'Test', summary: 'A summary',
        resource_kind: 'mod', visibility: 'public', download_count: 42,
        latest_version: {
          public_id: 'ver', id: 10, version: '1.0', display_version: '1.0',
          status: 'published', is_legacy_root_release: true,
          files: [{ public_id: 'f1', id: 1, role: 'primary' }],
        },
        attributions: [{ id: 1, role: 'submitter', subject_type: 'local_user', display_name: null, user_id: 42 }],
      }),
    };
    const controller = new ResourcesV1Controller(capabilities as any, adapter as any);

    const result = await controller.getResource(1);

    expect(result.id).toBe(1);
    expect(result.title).toBe('Test');
    expect(result.latest_version).not.toBeNull();
    expect(result.latest_version!.file_count).toBe(1);
    expect(result.attributions).toHaveLength(1);
    expect(result.download_count).toBe(42);
  });

  it('lists public resources through the same capability gate', async () => {
    const capabilities = { getCapabilities: jest.fn().mockResolvedValue({ resource_read: true }) };
    const adapter = { listResourcesV1: jest.fn().mockResolvedValue({ items: [{ id: 2, title: 'Mod' }], pagination: { limit: 20, offset: 0, next_offset: null, has_more: false } }) };
    const controller = new ResourcesV1Controller(capabilities as any, adapter as any);

    await expect(controller.listResources('20', '0', 'mod')).resolves.toMatchObject({ items: [{ id: 2, title: 'Mod' }] });
    expect(adapter.listResourcesV1).toHaveBeenCalledWith({ limit: 20, offset: 0, search: 'mod' });
  });
});

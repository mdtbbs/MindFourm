import type { Response } from 'express';
import { ResourcesController } from './resources.controller';
import { RESOURCE_TRANSFER_FORMAT } from './resource-transfer.util';

describe('ResourcesController.getById', () => {
  const response = {
    redirect: jest.fn(),
    json: jest.fn(),
  } as unknown as Response;
  const resourcesService = {
    findMergedResourceTarget: jest.fn(),
    getByIdWithVersions: jest.fn(),
  };

  let controller: ResourcesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = Object.create(ResourcesController.prototype) as ResourcesController;
    Object.defineProperty(controller, 'resourcesService', { value: resourcesService });
    response.redirect = jest.fn() as unknown as Response['redirect'];
    response.json = jest.fn() as unknown as Response['json'];
  });

  it('returns a JSON envelope for an ordinary resource', async () => {
    const resource = { id: 12, title: 'Resource 12' };
    resourcesService.findMergedResourceTarget.mockResolvedValue(null);
    resourcesService.getByIdWithVersions.mockResolvedValue(resource);

    await controller.getById(12, { user: { id: 7 } }, response);

    expect(response.redirect).not.toHaveBeenCalled();
    expect(resourcesService.getByIdWithVersions).toHaveBeenCalledWith(12, { id: 7 });
    expect(response.json).toHaveBeenCalledWith({ success: true, data: resource });
  });

  it('permanently redirects a merged resource to its canonical id', async () => {
    resourcesService.findMergedResourceTarget.mockResolvedValue(3);

    await controller.getById(12, { user: null }, response);

    expect(response.redirect).toHaveBeenCalledWith(301, '/api/resources/3');
    expect(resourcesService.getByIdWithVersions).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });
});

describe('ResourcesController resource transfer', () => {
  it('exports a source-bound transfer manifest for an administrator', async () => {
    const controller = Object.create(ResourcesController.prototype) as ResourcesController;
    const resource = { id: 12, public_id: 'public-12', title: 'Map' };
    const resourcesService = { getTransferExportData: jest.fn().mockResolvedValue(resource) };
    Object.defineProperty(controller, 'resourcesService', { value: resourcesService });
    Object.defineProperty(controller, 'siteConfig', { value: { current: { profile: 'mindustry-club', domain: 'mindustry.club' } } });

    const manifest = await controller.exportManifest(12, { user: { id: 7, role: 'admin' } });

    expect(resourcesService.getTransferExportData).toHaveBeenCalledWith(12, { id: 7, role: 'admin' });
    expect(manifest).toMatchObject({
      format: RESOURCE_TRANSFER_FORMAT,
      origin: { site: 'mindustry-club', resource_id: '12' },
      resource: { title: 'Map' },
    });
  });

  it('imports an external resource with trusted origin provenance', async () => {
    const controller = Object.create(ResourcesController.prototype) as ResourcesController;
    const resourcesService = { create: jest.fn().mockResolvedValue({ id: 92, title: 'Mod' }) };
    Object.defineProperty(controller, 'resourcesService', { value: resourcesService });
    Object.defineProperty(controller, 'siteConfig', { value: { current: { profile: 'mindustry-club' } } });
    Object.defineProperty(controller, 'resourceStorageService', { value: { storeIncoming: jest.fn() } });
    Object.defineProperty(controller, 'logsService', { value: { log: jest.fn().mockResolvedValue(undefined) } });
    const manifest = {
      format: RESOURCE_TRANSFER_FORMAT,
      origin: { site: 'mdtbbs', resource_id: '23', url: 'https://mdtbbs.cn/resources/23' },
      resource: {
        title: 'Mod', resource_type: 'external', resource_kind: 'mod', version: '1.0.0',
        external_url: 'https://github.com/example/mod', is_public: 1,
      },
    };

    const result = await controller.importManifest({ manifest: JSON.stringify(manifest), is_public: '1' }, undefined, {
      user: { id: 7, role: 'admin' }, headers: {},
    });

    expect(resourcesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Mod', resource_type: 'external' }),
      7,
      undefined,
      expect.objectContaining({ origin: { site: 'mdtbbs', resourceId: '23', url: 'https://mdtbbs.cn/resources/23' } }),
    );
    expect(result).toEqual({ resource: { id: 92, title: 'Mod' } });
  });
});

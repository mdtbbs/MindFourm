import type { Response } from 'express';
import { ResourcesController } from './resources.controller';

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

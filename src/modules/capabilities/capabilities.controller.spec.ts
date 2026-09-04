import 'reflect-metadata';
import { API_V1_CONTRACT } from '../../common/decorators/api-v1.decorator';
import { CapabilitiesController } from './capabilities.controller';

describe('CapabilitiesController', () => {
  it('is marked as a V1 controller and returns the service result', async () => {
    const service = {
      getCapabilities: jest.fn(async () => ({ resource_read: false })),
    } as any;
    const controller = new CapabilitiesController(service);

    await expect(controller.getCapabilities()).resolves.toEqual({ resource_read: false });
    expect(Reflect.getMetadata(API_V1_CONTRACT, CapabilitiesController)).toBe(true);
  });
});

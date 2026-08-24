import 'reflect-metadata';
import { API_V1_CONTRACT } from '@common/decorators/api-v1.decorator';
import { AdminNoticesController, NoticesController } from './notices.controller';

describe('Notices V1 controllers', () => {
  const service = { listPublic: jest.fn(), getPublic: jest.fn(), listAdmin: jest.fn(), create: jest.fn(), update: jest.fn(), softDelete: jest.fn() };

  it('marks public and admin controllers as V1 contracts', () => {
    expect(Reflect.getMetadata(API_V1_CONTRACT, NoticesController)).toBe(true);
    expect(Reflect.getMetadata(API_V1_CONTRACT, AdminNoticesController)).toBe(true);
  });

  it('passes public filters to the service without requiring a session', async () => {
    service.listPublic.mockResolvedValue({ data: [] });
    const result = await new NoticesController(service as any).list('10', '20', 'maintenance', 'true');
    expect(result).toEqual({ data: [] });
    expect(service.listPublic).toHaveBeenCalledWith({ limit: 10, offset: 20, type: 'maintenance', pinned: true });
  });
});

import { HttpStatus } from '@nestjs/common';
import { LanLinkRoomsService } from './lanlink-rooms.service';

describe('LanLinkRoomsService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const service = (enabled = true, baseUrl = 'http://lanlink.test') => new LanLinkRoomsService({
    get: jest.fn((key: string) => key === 'lanlink.enabled' ? enabled : baseUrl),
  } as any);

  it('projects only safe public room display fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ rooms: [
        {
          code: 'LL-ABCD-1234', name: '公开房间', display_name: '周末生存', public: true,
          owner: { display_name: '房主' },
          node: { id: 'node-1', name: '华东节点', addr: 'secret.example', room_port: 6567 },
          direct: { addr: 'secret.example', port: 6567 },
        },
        { code: 'PRIVATE', public: false },
      ] }),
    }) as any;

    await expect(service().getPublicRooms()).resolves.toEqual({
      rooms: [{
        code: 'LL-ABCD-1234', name: '公开房间', display_name: '周末生存',
        owner: { display_name: '房主' }, node: { id: 'node-1', name: '华东节点' },
      }],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://lanlink.test/api/rooms/public',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('fails closed when the integration is disabled', async () => {
    await service(false).getPublicRooms().then(
      () => fail('expected unavailable error'),
      (error) => {
        expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
        expect(error.code).toBe('LANLINK_UNAVAILABLE');
      },
    );
  });

  it('returns a retryable V1 error when LanLink cannot be reached', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as any;
    await service().getPublicRooms().then(
      () => fail('expected unavailable error'),
      (error) => {
        expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
        expect(error.retryable).toBe(true);
      },
    );
  });
});

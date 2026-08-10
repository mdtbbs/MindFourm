import { GameServerService } from './game-server.service';

describe('GameServerService', () => {
  it('returns null for non-existent server', async () => {
    const service = new GameServerService({ findOne: jest.fn().mockResolvedValue(null) } as any, {} as any);
    expect(await service.getServerDetail(999)).toBeNull();
  });

  it('returns null for non-public server', async () => {
    const service = new GameServerService({ findOne: jest.fn().mockResolvedValue({ id: 1, is_public: false }) } as any, {} as any);
    expect(await service.getServerDetail(1)).toBeNull();
  });

  it('lists public servers', async () => {
    const servers = [{ id: 1, public_id: 'a', name: 'S1', slug: null, description: null, hostname: '1.2.3.4', port: 6567, protocol: 'tcp', server_type: 'community', status: 'active', is_public: true }];
    const service = new GameServerService({ find: jest.fn().mockResolvedValue(servers) } as any, { findOne: jest.fn().mockResolvedValue(null) } as any);
    const result = await service.listPublicServers();
    expect(result).toHaveLength(1);
  });

  it('records a snapshot', async () => {
    const snapRepo = { create: jest.fn().mockReturnValue({}), save: jest.fn().mockResolvedValue({}) };
    const service = new GameServerService({} as any, snapRepo as any);
    await service.recordSnapshot(1, { isOnline: true, playerCount: 10, maxPlayers: 50, mapName: 'Test' });
    expect(snapRepo.save).toHaveBeenCalled();
  });
});

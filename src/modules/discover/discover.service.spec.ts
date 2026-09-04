import { DiscoverService } from './discover.service';

describe('DiscoverService', () => {
  it('aggregates counts and recent items from multiple domains', async () => {
    const resourceRepo = {
      count: jest.fn().mockResolvedValue(50),
      find: jest.fn().mockResolvedValue([{ id: 1, title: 'R1', created_at: new Date('2026-01-01') }]),
    };
    const postRepo = {
      count: jest.fn().mockResolvedValue(200),
      find: jest.fn().mockResolvedValue([{ id: 10, title: 'T1', created_at: new Date('2026-01-02') }]),
    };
    const serverRepo = {
      count: jest.fn().mockResolvedValue(5),
      find: jest.fn().mockResolvedValue([{ id: 1, name: 'S1', hostname: '1.2.3.4', port: 6567 }]),
    };

    const service = new DiscoverService(resourceRepo as any, postRepo as any, serverRepo as any);
    const result = await service.getDiscoverSummary();

    expect(result.total_resources).toBe(50);
    expect(result.total_threads).toBe(200);
    expect(result.total_servers).toBe(5);
    expect(result.recent_resources).toHaveLength(1);
    expect(result.recent_threads).toHaveLength(1);
    expect(result.active_servers).toHaveLength(1);
  });
});

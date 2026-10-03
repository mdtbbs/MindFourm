import { DiscoverService } from './discover.service';

describe('DiscoverService', () => {
  it('aggregates counts and recent items from multiple domains', async () => {
    const resourceRepo = {
      count: jest.fn().mockResolvedValue(50),
      find: jest.fn().mockResolvedValue([{ id: 1, title: 'R1', created_at: new Date('2026-01-01') }]),
    };
    const query = () => ({
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(200),
      getMany: jest.fn().mockResolvedValue([{ id: 10, title: 'T1', created_at: new Date('2026-01-02') }]),
    });
    const countQuery = query();
    const recentQuery = query();
    const postRepo = { createQueryBuilder: jest.fn().mockReturnValueOnce(countQuery).mockReturnValueOnce(recentQuery) };
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
    expect(postRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
    for (const builder of [countQuery, recentQuery]) {
      expect(builder.andWhere).toHaveBeenCalledWith('post.status = :postVisibilityStatus', { postVisibilityStatus: 'published' });
      expect(builder.andWhere).toHaveBeenCalledWith('post.required_group_id IS NULL', undefined);
      expect(builder.andWhere.mock.calls.some(([where]) => String(where).includes('post_visibility_resource'))).toBe(true);
    }
  });
});

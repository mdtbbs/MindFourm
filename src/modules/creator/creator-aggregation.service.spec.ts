import { CreatorAggregationService } from './creator-aggregation.service';

describe('CreatorAggregationService', () => {
  const makeAttributionRepo = (count: number, downloadsTotal: number, favoritesTotal: number) => {
    let callIndex = 0;
    const rawResults = [{ total: downloadsTotal }, { total: favoritesTotal }];
    return {
      count: jest.fn().mockResolvedValue(count),
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockImplementation(() => Promise.resolve(rawResults[callIndex++])),
      }),
    };
  };

  it('returns null for non-existent user', async () => {
    const userRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new CreatorAggregationService(userRepo as any, {} as any, {} as any, {} as any);
    expect(await service.getCreatorProfile(999)).toBeNull();
  });

  it('builds a creator profile with counts', async () => {
    const user = {
      id: 42,
      username: 'creator1',
      created_at: new Date('2025-01-01'),
    };
    const userRepo = { findOne: jest.fn().mockResolvedValue(user) };
    const attributionRepo = makeAttributionRepo(5, 150, 23);
    const postRepo = { count: jest.fn().mockResolvedValue(12) };
    const favoriteRepo = { count: jest.fn().mockResolvedValue(0) };

    const service = new CreatorAggregationService(
      userRepo as any,
      attributionRepo as any,
      postRepo as any,
      favoriteRepo as any,
    );
    const profile = await service.getCreatorProfile(42);

    expect(profile).not.toBeNull();
    expect(profile!.user_id).toBe(42);
    expect(profile!.username).toBe('creator1');
    expect(profile!.display_name).toBeNull();
    expect(profile!.resource_count).toBe(5);
    expect(profile!.thread_count).toBe(12);
    expect(profile!.total_downloads).toBe(150);
    expect(profile!.favorite_count).toBe(23);
    expect(profile!.member_since).toBeTruthy();
  });

  it('handles zero counts gracefully', async () => {
    const user = { id: 7, username: 'newbie', created_at: new Date('2026-08-01') };
    const userRepo = { findOne: jest.fn().mockResolvedValue(user) };
    const attributionRepo = makeAttributionRepo(0, 0, 0);
    const postRepo = { count: jest.fn().mockResolvedValue(0) };
    const favoriteRepo = { count: jest.fn().mockResolvedValue(0) };

    const service = new CreatorAggregationService(
      userRepo as any,
      attributionRepo as any,
      postRepo as any,
      favoriteRepo as any,
    );
    const profile = await service.getCreatorProfile(7);

    expect(profile).not.toBeNull();
    expect(profile!.resource_count).toBe(0);
    expect(profile!.thread_count).toBe(0);
    expect(profile!.total_downloads).toBe(0);
    expect(profile!.favorite_count).toBe(0);
  });
});

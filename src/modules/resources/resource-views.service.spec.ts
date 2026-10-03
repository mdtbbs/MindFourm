import {
  classifyResourceReferrer,
  isResourceViewCrawler,
  ResourceViewsService,
} from './resource-views.service';

function createDataSource(recent = false) {
  const queryRunner = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn(async (sql: string) => {
      if (sql.includes('SELECT last_viewed_at')) return recent ? [{ is_recent: 1 }] : [{ is_recent: 0 }];
      return [];
    }),
    manager: {
      insert: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue({ affected: 1 }),
    },
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
  };
  return {
    queryRunner,
    dataSource: { createQueryRunner: jest.fn(() => queryRunner) } as any,
  };
}

describe('ResourceViewsService', () => {
  it('classifies only internal navigation paths and never stores the external URL', () => {
    expect(classifyResourceReferrer('https://forum.mdtbbs.cn/', 'forum.mdtbbs.cn')).toBe('home');
    expect(classifyResourceReferrer('https://forum.mdtbbs.cn/search?q=map', 'forum.mdtbbs.cn')).toBe('search');
    expect(classifyResourceReferrer('https://mindustry.club/resources?category=maps', 'forum.mdtbbs.cn')).toBe('category');
    expect(classifyResourceReferrer('https://example.org/campaign?secret=1', 'forum.mdtbbs.cn')).toBe('external');
    expect(classifyResourceReferrer(undefined, 'forum.mdtbbs.cn')).toBe('direct');
  });

  it('rejects crawler views before opening a database transaction', async () => {
    const { dataSource } = createDataSource();
    const service = new ResourceViewsService(dataSource);

    await expect(service.recordView({
      resourceId: 3,
      ownerUserId: 9,
      userId: null,
      visitorKeys: ['cookie:abc'],
      userAgent: 'Googlebot/2.1',
      referrerCategory: 'direct',
      viewedAt: new Date(),
    })).resolves.toBe(false);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(isResourceViewCrawler('Mozilla/5.0 Googlebot/2.1')).toBe(true);
  });

  it('does not count the resource owner viewing their own resource', async () => {
    const { dataSource } = createDataSource();
    const service = new ResourceViewsService(dataSource);

    await expect(service.recordView({
      resourceId: 3,
      ownerUserId: 9,
      userId: 9,
      visitorKeys: ['cookie:abc'],
      userAgent: 'Mozilla/5.0',
      referrerCategory: 'direct',
      viewedAt: new Date(),
    })).resolves.toBe(false);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('records an eligible view and increments the resource in the same transaction', async () => {
    const { dataSource, queryRunner } = createDataSource(false);
    const service = new ResourceViewsService(dataSource);

    await expect(service.recordView({
      resourceId: 3,
      ownerUserId: 9,
      userId: 12,
      visitorKeys: ['cookie:abc', 'ipua:192.0.2.4:Mozilla/5.0'],
      userAgent: 'Mozilla/5.0',
      referrerCategory: 'search',
      viewedAt: new Date('2026-10-03T00:00:00Z'),
    })).resolves.toBe(true);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT last_viewed_at'),
      expect.any(Array),
    );
    expect(queryRunner.manager.insert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      resource_id: 3,
      user_id: 12,
      referrer_category: 'search',
    }));
    expect(queryRunner.manager.increment).toHaveBeenCalledWith(expect.anything(), { id: 3 }, 'view_count', 1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('deduplicates a visitor within the rolling hour without writing an event', async () => {
    const { dataSource, queryRunner } = createDataSource(true);
    const service = new ResourceViewsService(dataSource);

    await expect(service.recordView({
      resourceId: 3,
      ownerUserId: 9,
      userId: null,
      visitorKeys: ['cookie:abc'],
      userAgent: 'Mozilla/5.0',
      referrerCategory: 'direct',
      viewedAt: new Date(),
    })).resolves.toBe(false);

    expect(queryRunner.manager.insert).not.toHaveBeenCalled();
    expect(queryRunner.manager.increment).not.toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('reports aggregate view metrics and download conversion for a selected range', async () => {
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('GROUP BY DATE(created_at)')) return [{ day: '2026-10-02', views_pv: '5', views_uv: '3' }];
        if (sql.includes('COUNT(DISTINCT visitor_hash) AS views_uv')) return [{ views_pv: '5', views_uv: '3' }];
        if (sql.includes('GROUP BY referrer_category')) return [{ referrer_category: 'search', count: '5' }];
        return [{ downloads: '2', favorites: '1', likes: '4', ratings: '2', comments: '3' }];
      }),
    } as any;
    const service = new ResourceViewsService(dataSource);

    await expect(service.getAnalytics(7, 3)).resolves.toMatchObject({
      range_days: 7,
      views: { pv: 5, uv: 3 },
      downloads: 2,
      download_conversion_percent: 40,
      favorites: 1,
      likes: 4,
      ratings: 2,
      comments: 3,
      daily: [{ day: '2026-10-02', pv: 5, uv: 3 }],
      referrers: [{ category: 'search', count: 5 }],
    });
    expect(dataSource.query).toHaveBeenCalledTimes(4);
    expect(dataSource.query.mock.calls[3][1]).toHaveLength(10);
    expect(dataSource.query.mock.calls[3][0]).toContain('INNER JOIN resources resource ON resource.discussion_thread_id = reply.post_id');
    expect(dataSource.query.mock.calls[3][0]).toContain("reply.status = 'published'");
  });
});

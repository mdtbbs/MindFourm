import { RssService } from './rss.service';

describe('RSS privacy', () => {
  it('applies public resource discussion visibility to both global and category feeds', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const posts = { createQueryBuilder: jest.fn(() => query) };
    const categories = { findOne: jest.fn().mockResolvedValue({ id: 4, name: 'General' }) };
    const service = new RssService(posts as any, categories as any, { getPublicSiteUrl: async () => 'https://example.test' } as any);
    await service.generatePostsRss(); await service.generateCategoryRss('general');
    expect(posts.createQueryBuilder).toHaveBeenCalledTimes(2);
    expect(query.andWhere).toHaveBeenCalledWith('post.status = :postVisibilityStatus', { postVisibilityStatus: 'published' });
    expect(query.andWhere).toHaveBeenCalledWith('post.required_group_id IS NULL', undefined);
    expect(query.andWhere.mock.calls.filter(([where]) => String(where).includes('post_visibility_resource')).length).toBe(2);
    expect(query.take).toHaveBeenCalledWith(50);
  });
});

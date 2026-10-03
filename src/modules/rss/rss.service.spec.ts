import { RssService } from './rss.service';

describe('RSS privacy', () => {
  it('applies the anonymous group wall to both global and category feeds', async () => {
    const posts = { find: jest.fn().mockResolvedValue([]) };
    const categories = { findOne: jest.fn().mockResolvedValue({ id: 4, name: 'General' }) };
    const service = new RssService(posts as any, categories as any, { get: () => 'https://example.test' } as any, { get: async () => 'https://example.test' } as any);
    await service.generatePostsRss(); await service.generateCategoryRss('general');
    for (const call of posts.find.mock.calls) {
      expect(call[0].where).toMatchObject({ status: 'published', required_group_id: expect.objectContaining({ _type: 'isNull' }) });
      expect(call[0].take).toBe(50);
    }
  });
});

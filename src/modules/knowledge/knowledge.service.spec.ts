import { KnowledgeService } from './knowledge.service';

describe('KnowledgeService', () => {
  it('returns null for non-existent article', async () => {
    const service = new KnowledgeService({ findOne: jest.fn().mockResolvedValue(null) } as any);
    expect(await service.getArticle(999)).toBeNull();
  });

  it('returns null for non-public article', async () => {
    const service = new KnowledgeService({ findOne: jest.fn().mockResolvedValue({ id: 1, is_public: false }) } as any);
    expect(await service.getArticle(1)).toBeNull();
  });

  it('lists published articles', async () => {
    const articles = [{ id: 1, public_id: 'a', title: 'Guide', slug: 'guide', summary: null, status: 'published', category: 'tutorial', is_public: true, related_resource_id: null, related_thread_id: null, created_at: new Date(), updated_at: new Date() }];
    const service = new KnowledgeService({ find: jest.fn().mockResolvedValue(articles) } as any);
    const result = await service.listPublished();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Guide');
  });
});

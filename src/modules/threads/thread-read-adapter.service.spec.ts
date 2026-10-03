import { ThreadReadAdapterService } from './thread-read-adapter.service';

function queryFor(posts: any[]) {
  const query: any = { leftJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(),
    getRawAndEntities: jest.fn().mockResolvedValue({entities:posts, raw: posts.map(post => ({post_id:post.id,post_card_excerpt:post.content}))}),
  };
  return query;
}

describe('ThreadReadAdapterService', () => {
  it('returns null for non-existent posts', async () => {
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(queryFor([])) };
    const service = new ThreadReadAdapterService(repo as any);
    expect(await service.getThreadV1(999)).toBeNull();
  });

  it('returns null for non-published posts', async () => {
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(queryFor([{ id: 1, status: 'draft', deleted_at: null }])) };
    const service = new ThreadReadAdapterService(repo as any);
    expect(await service.getThreadV1(1)).toBeNull();
  });

  it('returns V1 DTO for published post', async () => {
    const post = {
      id: 1, title: 'Test Thread', slug: 'test-thread', status: 'published',
      is_pinned: 0, is_locked: 0, view_count: 100, reply_count: 5,
      created_at: new Date('2026-01-01'), updated_at: new Date('2026-01-02'),
      category_id: 3, user_id: 42, deleted_at: null, content: 'A **useful** post',
      user: { id: 42, username: 'writer', avatar_url: '/avatar.png' },
      category: { id: 3, name: 'General', slug: 'general' },
    };
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(queryFor([post])) };
    const service = new ThreadReadAdapterService(repo as any);

    const result = await service.getThreadV1(1);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.title).toBe('Test Thread');
    expect(result!.view_count).toBe(100);
    expect(result!.author).toEqual({ id: 42, username: 'writer', avatar_url: '/avatar.png' });
    expect(result!.category).toEqual({ id: 3, name: 'General', slug: 'general' });
    expect(result!.excerpt).toContain('useful');
  });

  it('loads enriched published threads with joined author and category projections', async () => {
    const posts = [
      { id: 1, title: 'Thread 1', slug: 't1', status: 'published', is_pinned: 0, is_locked: 0, view_count: 0, reply_count: 0, created_at: new Date(), updated_at: new Date(), category_id: null, user_id: 1, deleted_at: null, content: 'Body', user: { id: 1, username: 'one', avatar_url: null }, category: null },
    ];
    const query = queryFor(posts);
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const service = new ThreadReadAdapterService(repo as any);

    const result = await service.listThreadsV1({ limit: 10 });
    expect(result).toHaveLength(1);
    expect(query.leftJoinAndSelect).toHaveBeenCalledWith('post.user', 'author');
    expect(query.leftJoinAndSelect).toHaveBeenCalledWith('post.category', 'category');
    expect(query.andWhere).toHaveBeenCalledWith('post.source = :source', { source: 'USER' });
    expect(result[0].author?.username).toBe('one');
    expect(query.andWhere).toHaveBeenCalledWith('post.required_group_id IS NULL', undefined);
    expect(query.select).toHaveBeenCalledWith(expect.not.arrayContaining(['post.content', 'post.content_html', 'post.content_json']));
  });

  it('keeps a requested category as an independent board', async () => {
    const query = queryFor([]);
    const repo = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const service = new ThreadReadAdapterService(repo as any);

    await service.listThreadsV1({ limit: 20, categoryId: 7 });

    expect(query.andWhere).toHaveBeenCalledWith('post.category_id = :categoryId', { categoryId: 7 });
  });
});

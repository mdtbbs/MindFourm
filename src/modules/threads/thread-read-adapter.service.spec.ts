import { ThreadReadAdapterService } from './thread-read-adapter.service';

describe('ThreadReadAdapterService', () => {
  it('returns null for non-existent posts', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new ThreadReadAdapterService(repo as any);
    expect(await service.getThreadV1(999)).toBeNull();
  });

  it('returns null for non-published posts', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue({ id: 1, status: 'draft', deleted_at: null }) };
    const service = new ThreadReadAdapterService(repo as any);
    expect(await service.getThreadV1(1)).toBeNull();
  });

  it('returns V1 DTO for published post', async () => {
    const post = {
      id: 1, title: 'Test Thread', slug: 'test-thread', status: 'published',
      is_pinned: 0, is_locked: 0, view_count: 100, reply_count: 5,
      created_at: new Date('2026-01-01'), updated_at: new Date('2026-01-02'),
      category_id: 3, user_id: 42, deleted_at: null,
    };
    const repo = { findOne: jest.fn().mockResolvedValue(post) };
    const service = new ThreadReadAdapterService(repo as any);

    const result = await service.getThreadV1(1);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.title).toBe('Test Thread');
    expect(result!.view_count).toBe(100);
  });

  it('lists published threads', async () => {
    const posts = [
      { id: 1, title: 'Thread 1', slug: 't1', status: 'published', is_pinned: 0, is_locked: 0, view_count: 0, reply_count: 0, created_at: new Date(), updated_at: new Date(), category_id: null, user_id: 1, deleted_at: null },
    ];
    const repo = { find: jest.fn().mockResolvedValue(posts) };
    const service = new ThreadReadAdapterService(repo as any);

    const result = await service.listThreadsV1({ limit: 10 });
    expect(result).toHaveLength(1);
  });
});

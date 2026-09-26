import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { API_V1_CONTRACT } from '../../../common/decorators/api-v1.decorator';
import { ThreadsV1Controller } from './threads-v1.controller';

describe('ThreadsV1Controller', () => {
  it('is marked as V1', () => {
    expect(Reflect.getMetadata(API_V1_CONTRACT, ThreadsV1Controller)).toBe(true);
  });

  it('throws THREAD_NOT_FOUND for missing thread', async () => {
    const adapter = { getThreadV1: jest.fn().mockResolvedValue(null) };
    const controller = new ThreadsV1Controller(adapter as any);
    try { await controller.getThread(999); } catch (e: any) {
      expect(e.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(e.code).toBe('THREAD_NOT_FOUND');
    }
  });

  it('returns thread when found', async () => {
    const thread = { id: 1, title: 'Test', status: 'published' };
    const adapter = { getThreadV1: jest.fn().mockResolvedValue(thread) };
    const controller = new ThreadsV1Controller(adapter as any);
    const result = await controller.getThread(1);
    expect(result.id).toBe(1);
  });

  it('adds viewer interaction state for an authenticated detail request', async () => {
    const adapter = { getThreadV1: jest.fn().mockResolvedValue({ id: 1, title: 'Test', status: 'published' }) };
    const posts = { findById: jest.fn().mockResolvedValue({ body: 'content', user_id: 7 }), getReplies: jest.fn().mockResolvedValue({ data: [{ id: 2, user_id: 7 }], total: 1, page: 1, limit: 50, totalPages: 1 }) };
    const likes = { isPostLiked: jest.fn().mockResolvedValue(true) };
    const bookmarks = { check: jest.fn().mockResolvedValue(false) };
    const controller = new ThreadsV1Controller(adapter as any, posts as any, likes as any, bookmarks as any);

    await expect(controller.getThread(1, { user: { id: 7 } })).resolves.toMatchObject({
      id: 1,
      viewer: { liked: true, bookmarked: false },
      replies: [{ id: 2, user_id: 7, is_owner: true }],
    });
  });

  it('returns null viewer state to anonymous callers', async () => {
    const adapter = { getThreadV1: jest.fn().mockResolvedValue({ id: 1, title: 'Test', status: 'published' }) };
    const posts = { findById: jest.fn().mockResolvedValue({ body: 'content', user_id: 3 }), getReplies: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 50, totalPages: 0 }) };
    const controller = new ThreadsV1Controller(adapter as any, posts as any);

    await expect(controller.getThread(1, {})).resolves.toMatchObject({ viewer: null });
  });

  it('routes q through the existing SearchService and retains list-array compatibility', async () => {
    const adapter = { listThreadsV1: jest.fn(), countThreadsV1: jest.fn() };
    const search = { searchPosts: jest.fn().mockResolvedValue({
      data: [{ id: 8, user_id: 5, category_id: 3, title: 'Needle', slug: 'needle', status: 'published', is_pinned: false, is_locked: true, view_count: 10, reply_count: 2, created_at: new Date('2026-01-01'), updated_at: new Date('2026-01-02'), author_name: 'writer', author_avatar_url: '/a.png', category_name: 'General', category_slug: 'general', excerpt: 'Found it' }],
      pagination: { page: 2, limit: 10, total: 11, totalPages: 2 },
    }) };
    const controller = new ThreadsV1Controller(adapter as any, undefined, undefined, undefined, search as any);

    const result = await controller.listThreads({ q: 'needle', page: 2, limit: 10, category_id: 3 } as any, { user: { id: 1 } });

    expect(search.searchPosts).toHaveBeenCalledWith('needle', { page: 2, limit: 10, categoryId: 3, sort: undefined }, { id: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({ author: { username: 'writer' }, category: { name: 'General' }, excerpt: 'Found it', is_locked: true });
    expect((result as any).__v1Pagination).toMatchObject({ page: 2, has_more: false });
  });

  it('adds a separately paginated reply endpoint while preserving detail replies', async () => {
    const adapter = { getThreadV1: jest.fn().mockResolvedValue({ id: 3, status: 'published' }) };
    const posts = { getReplies: jest.fn().mockResolvedValue({ data: [{ id: 14, user_id: 2 }], total: 3, page: 2, limit: 1, totalPages: 3 }) };
    const controller = new ThreadsV1Controller(adapter as any, posts as any);
    const result = await controller.getReplies(3, '2', '1', { user: { id: 2 } });
    expect(result).toEqual([{ id: 14, user_id: 2, is_owner: true }]);
    expect((result as any).__v1Pagination).toMatchObject({ page: 2, total_pages: 3, has_more: true });
  });
});

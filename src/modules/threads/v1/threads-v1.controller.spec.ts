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
    const posts = { findById: jest.fn().mockResolvedValue({ body: 'content', user_id: 7 }), getReplies: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 50, totalPages: 0 }) };
    const likes = { isPostLiked: jest.fn().mockResolvedValue(true) };
    const bookmarks = { check: jest.fn().mockResolvedValue(false) };
    const controller = new ThreadsV1Controller(adapter as any, posts as any, likes as any, bookmarks as any);

    await expect(controller.getThread(1, { user: { id: 7 } })).resolves.toMatchObject({
      id: 1,
      viewer: { liked: true, bookmarked: false },
    });
  });

  it('returns null viewer state to anonymous callers', async () => {
    const adapter = { getThreadV1: jest.fn().mockResolvedValue({ id: 1, title: 'Test', status: 'published' }) };
    const posts = { findById: jest.fn().mockResolvedValue({ body: 'content', user_id: 3 }), getReplies: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 50, totalPages: 0 }) };
    const controller = new ThreadsV1Controller(adapter as any, posts as any);

    await expect(controller.getThread(1, {})).resolves.toMatchObject({ viewer: null });
  });
});

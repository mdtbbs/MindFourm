import { NotFoundException } from '@nestjs/common';
import { BookmarksService } from './bookmarks.service';

describe('BookmarksService V1 idempotency', () => {
  const bookmarks = { delete: jest.fn() };
  const posts = { findOne: jest.fn() };
  const service = new BookmarksService(bookmarks as any, posts as any, {} as any, {} as any);

  beforeEach(() => jest.clearAllMocks());

  it('removes a bookmark as a no-op when it is already absent', async () => {
    posts.findOne.mockResolvedValue({ id: 9 });
    bookmarks.delete.mockResolvedValue({ affected: 0 });

    await expect(service.ensureRemoved(7, 9)).resolves.toBeUndefined();
  });

  it('reports a missing thread', async () => {
    posts.findOne.mockResolvedValue(null);

    await expect(service.ensureRemoved(7, 999)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BookmarksService resource discussion visibility', () => {
  it('does not return a bookmarked resource discussion after its resource becomes private', async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const bookmarkRepo = { createQueryBuilder: jest.fn().mockReturnValue(query) };
    const service = new BookmarksService(bookmarkRepo as any, {} as any, {} as any, {} as any);

    await service.getByUserId(7, 1, 20);

    expect(query.andWhere.mock.calls.some(([where]) => String(where).includes('post_visibility_resource'))).toBe(true);
    expect(query.andWhere.mock.calls[0]).toEqual([
      expect.stringContaining("COALESCE(post.post_type, 'normal') <> 'resource_discussion'"),
      { postVisibilityUser: 7 },
    ]);
  });
});

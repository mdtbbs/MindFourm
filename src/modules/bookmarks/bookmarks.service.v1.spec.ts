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

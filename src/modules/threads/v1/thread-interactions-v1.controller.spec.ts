import { ThreadInteractionsV1Controller } from './thread-interactions-v1.controller';

describe('ThreadInteractionsV1Controller', () => {
  const likes = {
    ensurePostLiked: jest.fn(),
    ensurePostUnliked: jest.fn(),
  };
  const bookmarks = { add: jest.fn(), ensureRemoved: jest.fn() };
  const controller = new ThreadInteractionsV1Controller(likes as any, bookmarks as any);
  const req = { user: { id: 7 } };

  beforeEach(() => jest.clearAllMocks());

  it('uses idempotent like service operations', async () => {
    likes.ensurePostLiked.mockResolvedValue({ liked: true, count: 4 });
    likes.ensurePostUnliked.mockResolvedValue({ liked: false, count: 3 });

    await expect(controller.like(9, req)).resolves.toEqual({ liked: true, count: 4 });
    await expect(controller.unlike(9, req)).resolves.toEqual({ liked: false, count: 3 });
    expect(likes.ensurePostLiked).toHaveBeenCalledWith(7, 9);
    expect(likes.ensurePostUnliked).toHaveBeenCalledWith(7, 9);
  });

  it('uses idempotent bookmark service operations', async () => {
    await expect(controller.bookmark(9, req)).resolves.toEqual({ bookmarked: true });
    await expect(controller.removeBookmark(9, req)).resolves.toEqual({ bookmarked: false });
    expect(bookmarks.add).toHaveBeenCalledWith(7, 9);
    expect(bookmarks.ensureRemoved).toHaveBeenCalledWith(7, 9);
  });
});

import { SearchV1Controller } from './v1-search.controller';

describe('SearchV1Controller', () => {
  const search = {
    searchPosts: jest.fn(),
  };
  const controller = new SearchV1Controller(search as any);

  beforeEach(() => jest.clearAllMocks());

  it('maps the Android M1 page request to the single V1 payload shape', async () => {
    search.searchPosts.mockResolvedValue({
      data: [{ id: 1, title: 'mod result' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    await expect(controller.posts({ q: 'mod', page: 1, limit: 20 } as any)).resolves.toEqual({
      items: [{ id: 1, title: 'mod result' }],
      __v1Pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
    });
    expect(search.searchPosts).toHaveBeenCalledWith('mod', { q: 'mod', page: 1, limit: 20 });
  });

  it('preserves an empty result as a successful zero-total page', async () => {
    search.searchPosts.mockResolvedValue({
      data: [],
      pagination: { page: 9, limit: 20, total: 0, totalPages: 0 },
    });

    await expect(controller.posts({ q: 'none', page: 9, limit: 20 } as any)).resolves.toEqual({
      items: [],
      __v1Pagination: { page: 9, limit: 20, total: 0, total_pages: 0 },
    });
  });
});

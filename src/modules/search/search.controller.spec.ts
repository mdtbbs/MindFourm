jest.mock('../../common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {},
}));

jest.mock('./search.service', () => ({
  SearchService: class SearchService {},
}));

import { SearchController } from './search.controller';

function createController(overrides: {
  searchService?: Record<string, jest.Mock>;
} = {}) {
  const searchService = {
    searchPosts: jest.fn().mockResolvedValue({
      data: [
        { id: 7, title: 'Result', excerpt: 'summary' },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
    }),
    searchResources: jest.fn().mockResolvedValue([]),
    recordSearch: jest.fn().mockResolvedValue(undefined),
    getPopularSearches: jest.fn().mockResolvedValue(['guide']),
    getSearchHistory: jest.fn().mockResolvedValue([
      { id: 1, query: 'guide' },
    ]),
    clearSearchHistory: jest.fn().mockResolvedValue(undefined),
    ...overrides.searchService,
  };

  const controller = new SearchController(searchService as any);

  return {
    controller,
    searchService,
  };
}

describe('SearchController', () => {
  it('returns a single-layer search payload and records the query', async () => {
    const { controller, searchService } = createController();

    const result = await controller.search({
      q: 'guide',
      page: 1,
      limit: 20,
      sort: 'relevance',
    } as any);

    expect(searchService.searchPosts).toHaveBeenCalledWith('guide', {
      page: 1,
      limit: 20,
      category: undefined,
      sort: 'relevance',
    });
    expect(searchService.searchResources).toHaveBeenCalledWith('guide', 20);
    expect(searchService.recordSearch).toHaveBeenCalledWith(undefined, 'guide', 1);
    expect(result).toMatchObject({
      data: [
        { id: 7, title: 'Result', excerpt: 'summary' },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      },
      popular_searches: ['guide'],
    });
    expect(result).not.toHaveProperty('success');
  });

  it('returns raw history and popular arrays without extra wrapping', async () => {
    const { controller, searchService } = createController();

    const history = await controller.getHistory({ user: { id: 5 } });
    const popular = await controller.getPopular();

    expect(searchService.getSearchHistory).toHaveBeenCalledWith(5);
    expect(history).toEqual([{ id: 1, query: 'guide' }]);
    expect(popular).toEqual(['guide']);
  });

  it('returns a plain confirmation payload when clearing history', async () => {
    const { controller, searchService } = createController();

    const result = await controller.clearHistory({ user: { id: 5 } });

    expect(searchService.clearSearchHistory).toHaveBeenCalledWith(5);
    expect(result).toEqual({ message: 'Search history cleared' });
  });
});

const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({
  applyDecorators: (...decorators: Array<(...args: any[]) => void>) => (...args: any[]) => decorators.forEach((decorator) => decorator(...args)),
  Controller: decorator,
  Get: decorator,
  Delete: decorator,
  Query: decorator,
  UseGuards: decorator,
  Req: decorator,
  SetMetadata: decorator,
}));

jest.mock('@nestjs/swagger', () => ({ ApiExtension: decorator }));

jest.mock('../../common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class JwtAuthGuard {},
}));

jest.mock('./search.service', () => ({
  SearchService: class SearchService {},
}));
jest.mock('./dto/search-query.dto', () => ({ SearchQueryDto: class SearchQueryDto {} }));

import { SearchController } from './search.controller';

function createController(overrides: {
  searchService?: Record<string, jest.Mock>;
} = {}) {
  const searchService = {
    withSearchAudit: jest.fn(async (_actor: any, query: string, execute: (value: string) => Promise<any>) => {
      const { value } = await execute(query);
      return value;
    }),
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
  it('returns a single-layer search payload through the authenticated audit wrapper', async () => {
    const { controller, searchService } = createController();
    const actor = { id: 5, username: 'alice', role: 'user' };

    const result = await controller.search({
      q: 'guide',
      page: 1,
      limit: 20,
      sort: 'relevance',
    } as any, { user: actor });

    expect(searchService.withSearchAudit).toHaveBeenCalledWith(actor, 'guide', expect.any(Function));
    expect(searchService.searchPosts).toHaveBeenCalledWith('guide', {
      page: 1,
      limit: 20,
      category: undefined,
      sort: 'relevance',
    }, actor);
    expect(searchService.searchResources).toHaveBeenCalledWith('guide', 20, actor, expect.objectContaining({ sort: 'relevance' }));
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

  it('counts a resource-only match as a successful global search', async () => {
    const { controller, searchService } = createController({
      searchService: {
        searchPosts: jest.fn().mockResolvedValue({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        }),
        searchResources: jest.fn().mockResolvedValue([{ id: 9, title: 'Resource match' }]),
      },
    });
    const actor = { id: 5, username: 'alice', role: 'user' };

    await controller.search({ q: 'resource', page: 1, limit: 20 } as any, { user: actor });

    expect(searchService.withSearchAudit).toHaveBeenCalledWith(actor, 'resource', expect.any(Function));
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

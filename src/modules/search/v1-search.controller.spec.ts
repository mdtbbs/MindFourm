const decorator = () => () => undefined;

jest.mock('@nestjs/common', () => ({
  Controller: decorator,
  Get: decorator,
  Query: decorator,
  Req: decorator,
  UseGuards: decorator,
  SetMetadata: decorator,
  applyDecorators: (...decorators: Array<(...args: any[]) => unknown>) => (...args: any[]) => {
    for (const apply of decorators) apply(...args);
  },
}));
jest.mock('@nestjs/swagger', () => ({
  ApiTags: decorator, ApiBearerAuth: decorator, ApiExtension: decorator,
  ApiForbiddenResponse: decorator, ApiUnauthorizedResponse: decorator,
}));
jest.mock('../../common/guards/jwt-auth.guard', () => ({ JwtAuthGuard: class JwtAuthGuard {} }));
jest.mock('../../common/guards/oauth-scope.guard', () => ({ OAuthScopeGuard: class OAuthScopeGuard {} }));
jest.mock('./search.service', () => ({ SearchService: class SearchService {} }));
jest.mock('./dto/search-query.dto', () => ({ SearchQueryDto: class SearchQueryDto {} }));

import { SearchV1Controller } from './v1-search.controller';

describe('SearchV1Controller', () => {
  const search = {
    withSearchAudit: jest.fn(async (_actor: any, query: string, execute: (value: string) => Promise<any>) => {
      const { value } = await execute(query);
      return value;
    }),
    searchPosts: jest.fn(),
    searchUnified: jest.fn(),
  };
  const controller = new SearchV1Controller(search as any);

  beforeEach(() => jest.clearAllMocks());

  it('maps the Android M1 page request to the single V1 payload shape', async () => {
    const actor = { id: 8, username: 'android-user', role: 'user' };
    search.searchPosts.mockResolvedValue({
      data: [{ id: 1, title: 'mod result' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    await expect(controller.posts({ q: 'mod', page: 1, limit: 20 } as any, { user: actor })).resolves.toEqual({
      items: [{ id: 1, title: 'mod result' }],
      __v1Pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
    });
    expect(search.withSearchAudit).toHaveBeenCalledWith(actor, 'mod', expect.any(Function));
    expect(search.searchPosts).toHaveBeenCalledWith('mod', { q: 'mod', page: 1, limit: 20 }, actor);
  });

  it('preserves an empty result as a successful zero-total page', async () => {
    const actor = { id: 8, username: 'android-user', role: 'user' };
    search.searchPosts.mockResolvedValue({
      data: [],
      pagination: { page: 9, limit: 20, total: 0, totalPages: 0 },
    });

    await expect(controller.posts({ q: 'none', page: 9, limit: 20 } as any, { user: actor })).resolves.toEqual({
      items: [],
      __v1Pagination: { page: 9, limit: 20, total: 0, total_pages: 0 },
    });
  });

  it('forwards the authenticated actor to unified V2 search', async () => {
    search.searchUnified.mockResolvedValue({ groups: { users: [] }, total_by_type: { users: 0 } });
    const viewer = { id: 92, role: 'user' };

    await expect(controller.unified({ q: 'uid:92', limit: 8 } as any, { user: viewer })).resolves.toEqual({
      groups: { users: [] }, total_by_type: { users: 0 },
    });
    expect(search.searchUnified).toHaveBeenCalledWith('uid:92', viewer, 8);
    expect(search.withSearchAudit).toHaveBeenCalledWith(viewer, 'uid:92', expect.any(Function));
  });
});

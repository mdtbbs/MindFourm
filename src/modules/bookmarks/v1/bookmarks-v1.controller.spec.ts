import 'reflect-metadata';
import { BookmarksV1Controller } from './bookmarks-v1.controller';
import { API_V1_CONTRACT } from '../../../common/decorators/api-v1.decorator';

describe('BookmarksV1Controller', () => {
  it('is marked as V1 and projects bookmark posts without a nested legacy envelope', async () => {
    const service = {
      getByUserId: jest.fn().mockResolvedValue({
        total: 1,
        bookmarks: [{
          post: {
            id: 3,
            title: 'Mod question',
            content: 'A useful post body',
            user_id: 9,
            view_count: 12,
            created_at: new Date('2026-01-01T00:00:00.000Z'),
            updated_at: new Date('2026-01-02T00:00:00.000Z'),
            user: { username: 'builder', avatar_url: null },
            category: { name: 'Mods', slug: 'mods' },
          },
        }],
      }),
    };
    const controller = new BookmarksV1Controller(service as any);

    await expect(controller.list({ user: { id: 7 } }, '0', '100')).resolves.toEqual({
      items: [expect.objectContaining({ id: 3, title: 'Mod question', author_name: 'builder', category_slug: 'mods' })],
      pagination: { page: 1, limit: 50, total: 1, total_pages: 1 },
    });
    expect(service.getByUserId).toHaveBeenCalledWith(7, 1, 50);
    expect(Reflect.getMetadata(API_V1_CONTRACT, BookmarksV1Controller)).toBe(true);
  });
});

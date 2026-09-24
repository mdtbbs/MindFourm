import { ResourceLikesService } from './resource-likes.service';
import { ResourceFavoritesService } from './resource-favorites.service';

describe('resource interaction idempotency', () => {
  const domain = { getById: jest.fn().mockResolvedValue({ id: 9, status: 'approved' }) };

  it('treats a concurrent duplicate like insert as success', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockRejectedValue({ code: 'ER_DUP_ENTRY' }),
      count: jest.fn().mockResolvedValue(1),
    };
    const result = await new ResourceLikesService(repo as any, domain as any).add(9, 4);
    expect(result).toEqual({ is_liked: true, like_count: 1 });
  });

  it('treats a concurrent duplicate favorite insert as success', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockRejectedValue({ code: 'ER_DUP_ENTRY' }),
      count: jest.fn().mockResolvedValue(1),
    };
    const result = await new ResourceFavoritesService(repo as any, domain as any).add(9, 4);
    expect(result).toEqual({ is_favorited: true, favorite_count: 1 });
  });

  it('makes unliking an absent row a successful no-op', async () => {
    const repo = { delete: jest.fn().mockResolvedValue({ affected: 0 }), count: jest.fn().mockResolvedValue(0) };
    const result = await new ResourceLikesService(repo as any, domain as any).remove(9, 4);
    expect(result).toEqual({ is_liked: false, like_count: 0 });
  });
});

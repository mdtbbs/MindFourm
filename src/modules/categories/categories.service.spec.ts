import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  function createService() {
    const builder = {
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          category_id: 3,
          category_name: 'Mod / 工具',
          category_slug: 'mods',
          category_sort_order: 2,
          category_is_active: 1,
          category_description: '发布与开发交流',
          category_color: '#9B7CF6',
          category_icon: 'Code2',
          category_group_key: 'creation',
          category_parent_id: null,
          category_show_in_sidebar: 1,
          category_created_at: new Date('2026-01-01'),
          post_count: '12',
        },
      ]),
    };
    const categoryRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(builder),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    const postRepository = { count: jest.fn().mockResolvedValue(12) };
    return {
      service: new CategoriesService(categoryRepository as any, postRepository as any),
      builder,
      categoryRepository,
    };
  }

  it('returns persisted presentation metadata on the public board list', async () => {
    const { service, builder } = createService();

    await expect(service.getAll()).resolves.toEqual([
      expect.objectContaining({
        id: 3,
        color: '#9B7CF6',
        icon: 'Code2',
        group_key: 'creation',
        show_in_sidebar: true,
        post_count: 12,
      }),
    ]);
    expect(builder.where).toHaveBeenCalledWith('category.is_active = :isActive', { isActive: 1 });
  });

  it('persists sidebar presentation fields when creating a board', async () => {
    const { service, categoryRepository } = createService();

    await service.create({
      name: 'Mod / 工具', slug: 'mods', description: '发布与开发交流',
      color: '#9B7CF6', icon: 'Code2', group_key: 'creation',
      sort_order: 2, is_active: true, show_in_sidebar: true,
    });

    expect(categoryRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      color: '#9B7CF6', icon: 'Code2', group_key: 'creation',
      is_active: 1, show_in_sidebar: 1,
    }));
  });
});

import { buildContentNavigation, contentNavigationCta } from './content-navigation';

const base = { settings: {}, isAuthenticated: false, forumCategories: [], resourceCategories: [] };

test('desktop and drawer receive a stable global section with domain-specific context', () => {
  const forum = buildContentNavigation({ ...base, mode: 'forum' });
  const resources = buildContentNavigation({ ...base, mode: 'resources' });
  expect(forum[0].items).toEqual(resources[0].items);
  expect(forum[1].items.some((item) => item.id === 'all-discussions')).toBe(true);
  expect(resources[1].items.some((item) => item.id === 'all-resources')).toBe(true);
});

test('desktop and mobile resource navigation expose only the shared resource_kind registry', () => {
  const resources = buildContentNavigation({
    ...base,
    mode: 'resources',
    resourceCategories: [{ id: 8, name: '新手推荐', slug: 'starter', description: null, icon: null, sort_order: 1, is_active: true, created_at: '' }],
  });
  const items = resources.find((section) => section.id === 'context')?.items || [];
  expect(items[0]).toMatchObject({ id: 'all-resources', label: '全部资源', href: '/resources' });
  expect(items.some((item) => item.href.includes('category_id'))).toBe(false);
  expect(items.map((item) => item.id)).toContain('resource-kind-map');
  expect(items.map((item) => item.id)).toContain('resource-kind-schematic');
  expect(items.map((item) => item.label)).not.toContain('新手推荐');
});

test('context CTA targets its product area and respects the resource feature flag', () => {
  expect(contentNavigationCta('resources')?.href).toBe('/resources/submit');
  expect(contentNavigationCta('forum')?.href).toBe('/posts/new');
  expect(contentNavigationCta('resources', { feature_resources_enabled: 'false' })).toBeNull();
});

test('global navigation honors admin configuration', () => {
  const configured = buildContentNavigation({
    ...base,
    mode: 'forum',
    settings: { sidebar_navigation_items: JSON.stringify([{ id: 'home', label: '社区首页', href: '/', icon: 'Home', enabled: true, requiresAuth: false }]) },
  });
  expect(configured[0].items[0]?.label).toBe('社区首页');
});

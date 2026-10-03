import { buildContentNavigation, contentNavigationCta } from './content-navigation';
import { siteProfile, type FrontendSiteProfile } from '@/config/site-profile';

const base = { settings: {}, isAuthenticated: false, forumCategories: [], resourceCategories: [] };
const clubProfile: FrontendSiteProfile = {
  ...siteProfile,
  profile: 'mindustry-club',
  branding: { ...siteProfile.branding, shortName: 'Mindustry Club' },
  features: { ...siteProfile.features, resources: true, developers: true, serversDirectory: true, lanlink: false },
  navigation: [
    { key: 'home', href: '/', label: 'Home' },
    { key: 'posts', href: '/threads', label: 'Discussions' },
    { key: 'resources', href: '/resources', label: 'Resources', feature: 'resources' },
    { key: 'discover', href: '/discover', label: 'Discover' },
    { key: 'developers', href: '/developers', label: 'Developers', feature: 'developers' },
    { key: 'servers', href: '/servers', label: 'Servers', feature: 'serversDirectory' },
    { key: 'wiki', href: '/wiki', label: 'Knowledge base' },
  ],
};

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

test('Mindustry Club navigation follows its profile and omits unavailable legacy links', () => {
  const club = buildContentNavigation({
    ...base,
    mode: 'forum',
    profile: clubProfile,
    translate: (key) => key,
  });
  const global = club[0].items;
  expect(global.map((item) => item.href)).toEqual(['/', '/threads', '/resources', '/discover', '/developers', '/servers', '/search']);
  expect(global.map((item) => item.label)).toContain('navigation.developers');
  expect(global.some((item) => item.href === '/wiki' || item.href === '/lanlink')).toBe(false);
  expect(club.find((section) => section.id === 'context')?.items[0]?.label).toBe('navigation.allDiscussions');
});

test('Mindustry Club publishing shortcuts use the selected locale', () => {
  const translate = (key: string) => key;
  expect(contentNavigationCta('forum', {}, translate, clubProfile)).toMatchObject({ label: 'navigation.publishDiscussion', href: '/posts/new' });
  expect(contentNavigationCta('resources', {}, translate, clubProfile)).toMatchObject({ label: 'navigation.publishResource', href: '/resources/submit' });
});

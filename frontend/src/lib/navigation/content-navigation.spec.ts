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
    translate: (key) => key,
    resourceCategories: [{ id: 8, name: '新手推荐', slug: 'starter', description: null, icon: null, sort_order: 1, is_active: true, created_at: '' }],
  });
  const items = resources.find((section) => section.id === 'context')?.items || [];
  expect(items[0]).toMatchObject({ id: 'all-resources', label: 'navigation.allResources', href: '/resources' });
  expect(items.some((item) => item.href.includes('category_id'))).toBe(false);
  expect(items.map((item) => item.id)).toContain('resource-kind-map');
  expect(items.map((item) => item.id)).toContain('resource-kind-schematic');
  expect(items.map((item) => item.label)).not.toContain('新手推荐');
});

test('context sections open by default so the sidebar shows where you can go', () => {
  const resources = buildContentNavigation({ ...base, mode: 'resources' });
  const forum = buildContentNavigation({ ...base, mode: 'forum' });
  for (const sections of [resources, forum]) {
    const context = sections.find((section) => section.id === 'context')!;
    // Still collapsible from its heading, just never pre-collapsed: a section
    // that starts closed hides every board behind a click on first paint.
    expect(context.collapsible).toBe(true);
    expect(context).not.toHaveProperty('defaultCollapsed');
  }
});

test('context CTA targets its product area and respects the resource feature flag', () => {
  expect(contentNavigationCta('resources')?.href).toBe('/resources/submit');
  expect(contentNavigationCta('forum')?.href).toBe('/posts/new');
  expect(contentNavigationCta('resources', { feature_resources_enabled: 'false' })).toBeNull();
});

test('global navigation assigns every configured item to exactly one section', () => {
  const configuredItem = (id: string, href: string) => ({ id, label: id, href, icon: 'Link', enabled: true, requiresAuth: false });
  const settings = {
    sidebar_navigation_items: JSON.stringify([
      configuredItem('home', '/'),
      configuredItem('categories', '/categories'),
      configuredItem('tags', '/tags'),
      configuredItem('resources', '/resources'),
      configuredItem('notices', '/notices'),
    ]),
    feature_servers_enabled: 'false',
    feature_lanlink_enabled: 'false',
  };
  const sections = buildContentNavigation({ ...base, mode: 'forum', settings });
  const byId = new Map(sections.flatMap((section) => section.items.map((item) => [item.id, section.id] as const)));

  // Nothing the operator configured may be dropped.
  for (const id of ['home', 'categories', 'tags', 'resources', 'notices']) {
    expect(byId.has(id)).toBe(true);
  }
  // /servers must not be duplicated across the global rail and the discover group.
  expect(sections.flatMap((section) => section.items).filter((item) => item.href === '/servers').length).toBeLessThanOrEqual(1);
});

test('discover section routes tags, notices and servers out of the global rail', () => {
  const configuredItem = (id: string, href: string) => ({ id, label: id, href, icon: 'Link', enabled: true, requiresAuth: false });
  const settings = {
    sidebar_navigation_items: JSON.stringify([
      configuredItem('home', '/'),
      configuredItem('tags', '/tags'),
      configuredItem('notices', '/notices'),
      configuredItem('resources', '/resources'),
      configuredItem('servers', '/servers'),
    ]),
    feature_servers_enabled: 'true',
    feature_lanlink_enabled: 'true',
  };
  const sections = buildContentNavigation({ ...base, mode: 'forum', settings });
  const global = sections.find((section) => section.id === 'global')!;
  const discover = sections.find((section) => section.id === 'discover')!;

  expect(global.items.some((item) => ['tags', 'notices', 'servers'].includes(item.id))).toBe(false);
  expect(discover.items.map((item) => item.id)).toEqual(['tags', 'notices', 'servers', 'lanlink']);
  expect(discover.label).toBe('navigation.discover');
  expect(discover.items.find((item) => item.id === 'lanlink')?.label).toBe('navigation.lanlink');
});

test('the rail keeps a single personal entry point in the account section', () => {
  const sections = buildContentNavigation({ ...base, mode: 'forum', isAuthenticated: true, userId: 7 });
  const account = sections.find((section) => section.id === 'account')!;
  expect(account.items.map((item) => item.href)).toEqual([
    '/users/7', '/bookmarks', '/messages', '/notifications', '/friends', '/settings',
  ]);
  // The workspace rail already links /me, so account must not repeat it.
  expect(account.items.some((item) => item.href === '/me')).toBe(false);
});

test('context 与 CTA 文案全部走翻译函数，不再硬编码中文', () => {
  const translate = (key: string) => key;
  const sections = buildContentNavigation({ ...base, mode: 'forum', translate });
  const context = sections.find((section) => section.id === 'context')!;
  expect(context.label).toBe('navigation.discussionBoards');
  expect(context.items[0].label).toBe('navigation.allDiscussions');
  expect(contentNavigationCta('forum', {}, translate)?.label).toBe('navigation.publishDiscussion');
  expect(contentNavigationCta('resources', {}, translate)?.label).toBe('navigation.publishResource');
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

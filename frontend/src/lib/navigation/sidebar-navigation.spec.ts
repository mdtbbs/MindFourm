import {
  buildSidebarNavigation,
  parseSidebarNavigationItems,
  type SidebarNavigationItem,
} from './sidebar-navigation';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nReceived: ${actualJson}`);
  }
}

function assertLength(actual: unknown[], expected: number, message: string): void {
  if (actual.length !== expected) {
    throw new Error(`${message}\nExpected length: ${expected}, Received: ${actual.length}`);
  }
}

// ─── parseSidebarNavigationItems ────────────────────────────────────────────

(function testParseEmptyAndInvalidInput() {
  assertDeepEqual(parseSidebarNavigationItems(undefined), [], 'undefined returns empty');
  assertDeepEqual(parseSidebarNavigationItems(''), [], 'empty string returns empty');
  assertDeepEqual(parseSidebarNavigationItems('not json'), [], 'malformed JSON returns empty');
  assertDeepEqual(parseSidebarNavigationItems('"string"'), [], 'non-array JSON returns empty');
  assertDeepEqual(parseSidebarNavigationItems('{}'), [], 'object JSON returns empty');
})();

(function testParseValidItems() {
  const input: SidebarNavigationItem[] = [
    { id: 'home', label: '首页', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
    { id: 'tags', label: '标签', href: '/tags', icon: 'Tag', enabled: false, requiresAuth: false },
  ];
  const result = parseSidebarNavigationItems(JSON.stringify(input));
  assertLength(result, 2, 'valid items should be parsed');
  assert(result[0].id === 'home', 'first item id should be home');
  assert(result[1].enabled === false, 'second item should be disabled');
})();

(function testParseDropsInvalidItems() {
  const input = [
    { id: 'ok', label: 'OK', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
    { id: 'bad', label: 123, href: '/', icon: 'Home', enabled: true, requiresAuth: false }, // label not string
    { id: 'bad2', label: 'X', href: '/', icon: 'Home', enabled: 'yes', requiresAuth: false }, // enabled not boolean
    'not an object',
    null,
  ];
  const result = parseSidebarNavigationItems(JSON.stringify(input));
  assertLength(result, 1, 'only valid items should survive');
  assert(result[0].id === 'ok', 'only the valid item should remain');
})();

// ─── buildSidebarNavigation — defaults ──────────────────────────────────────

(function testDefaultsWhenNoSetting() {
  const result = buildSidebarNavigation({ settings: {}, isAuthenticated: false });

  assert(result.length === 4, 'default should have 4 items');
  assertDeepEqual(
    result.map((i) => ({ id: i.id, label: i.label, href: i.href })),
    [
      { id: 'home', label: '首页', href: '/' },
      { id: 'categories', label: '分类', href: '/categories' },
      { id: 'tags', label: '标签', href: '/tags' },
      { id: 'resources', label: '资源中心', href: '/resources' },
    ],
    'defaults should match the backend defaults',
  );
})();

(function testDefaultsIncludeAllWhenAuthenticated() {
  const result = buildSidebarNavigation({ settings: {}, isAuthenticated: true });
  assert(result.length === 4, 'authenticated users should see all 4 default items');
})();

// ─── buildSidebarNavigation — enabled filter ────────────────────────────────

(function testDisabledItemsAreFiltered() {
  const items: SidebarNavigationItem[] = [
    { id: 'a', label: 'A', href: '/a', icon: 'Home', enabled: true, requiresAuth: false },
    { id: 'b', label: 'B', href: '/b', icon: 'Tag', enabled: false, requiresAuth: false },
    { id: 'c', label: 'C', href: '/c', icon: 'Book', enabled: true, requiresAuth: false },
  ];
  const result = buildSidebarNavigation({
    settings: { sidebar_navigation_items: JSON.stringify(items) },
    isAuthenticated: false,
  });

  assertLength(result, 2, 'disabled items should be filtered out');
  assert(result[0].id === 'a', 'first enabled item should remain');
  assert(result[1].id === 'c', 'second enabled item should remain');
})();

// ─── buildSidebarNavigation — requiresAuth filter ───────────────────────────

(function testRequiresAuthFiltersAnonymousUsers() {
  const items: SidebarNavigationItem[] = [
    { id: 'public', label: 'Public', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
    { id: 'private', label: 'Private', href: '/dashboard', icon: 'Settings', enabled: true, requiresAuth: true },
  ];

  const anonResult = buildSidebarNavigation({
    settings: { sidebar_navigation_items: JSON.stringify(items) },
    isAuthenticated: false,
  });
  assertLength(anonResult, 1, 'anonymous users should not see requiresAuth items');
  assert(anonResult[0].id === 'public', 'only public item should remain');

  const authResult = buildSidebarNavigation({
    settings: { sidebar_navigation_items: JSON.stringify(items) },
    isAuthenticated: true,
  });
  assertLength(authResult, 2, 'authenticated users should see all enabled items');
})();

// ─── buildSidebarNavigation — anonymous href safety ─────────────────────────

(function testAnonymousUsersCannotSeeAuthOnlyPaths() {
  const items: SidebarNavigationItem[] = [
    { id: 'notifications', label: '通知', href: '/notifications', icon: 'Bell', enabled: true, requiresAuth: false },
    { id: 'messages', label: '消息', href: '/messages', icon: 'Mail', enabled: true, requiresAuth: false },
    { id: 'public-page', label: '公开', href: '/about', icon: 'Info', enabled: true, requiresAuth: false },
    { id: 'external', label: '外部', href: 'https://example.com', icon: 'ExternalLink', enabled: true, requiresAuth: false },
  ];

  const result = buildSidebarNavigation({
    settings: { sidebar_navigation_items: JSON.stringify(items) },
    isAuthenticated: false,
  });

  assertLength(result, 2, 'anonymous users should not see auth-only prefix paths');
  assert(result[0].id === 'public-page', 'public page should be visible');
  assert(result[1].id === 'external', 'external links should be visible');
})();

// ─── buildSidebarNavigation — featureKey filter ─────────────────────────────

(function testFeatureKeyFiltersDisabledFeatures() {
  const items: SidebarNavigationItem[] = [
    { id: 'resources', label: '资源', href: '/resources', icon: 'Book', enabled: true, requiresAuth: false, featureKey: 'feature_resources_enabled' },
    { id: 'servers', label: '服务器', href: '/servers', icon: 'Users', enabled: true, requiresAuth: false, featureKey: 'feature_servers_enabled' },
    { id: 'plain', label: '普通', href: '/about', icon: 'Info', enabled: true, requiresAuth: false },
  ];

  const result = buildSidebarNavigation({
    settings: {
      sidebar_navigation_items: JSON.stringify(items),
      feature_resources_enabled: 'false',
      feature_servers_enabled: 'false',
    },
    isAuthenticated: false,
  });

  assertLength(result, 1, 'disabled features should be filtered out');
  assert(result[0].id === 'plain', 'only the item without featureKey should remain');
})();

(function testFeatureKeyDefaultEnabledWhenMissing() {
  const items: SidebarNavigationItem[] = [
    { id: 'x', label: 'X', href: '/x', icon: 'Home', enabled: true, requiresAuth: false, featureKey: 'feature_x_enabled' },
  ];

  const result = buildSidebarNavigation({
    settings: { sidebar_navigation_items: JSON.stringify(items) },
    isAuthenticated: false,
  });

  assertLength(result, 1, 'missing featureKey setting should default to enabled');
})();

// ─── buildSidebarNavigation — combined filters ──────────────────────────────

(function testCombinedFilters() {
  const items: SidebarNavigationItem[] = [
    { id: 'visible', label: 'V', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
    { id: 'disabled', label: 'D', href: '/d', icon: 'Tag', enabled: false, requiresAuth: false },
    { id: 'auth-only', label: 'A', href: '/a', icon: 'Bell', enabled: true, requiresAuth: true },
    { id: 'feature-off', label: 'F', href: '/f', icon: 'Book', enabled: true, requiresAuth: false, featureKey: 'feature_resources_enabled' },
  ];

  const result = buildSidebarNavigation({
    settings: {
      sidebar_navigation_items: JSON.stringify(items),
      feature_resources_enabled: 'false',
    },
    isAuthenticated: false,
  });

  assertLength(result, 1, 'all filters should combine correctly');
  assert(result[0].id === 'visible', 'only the fully-visible item should remain');
})();

(function testFallbackWhenSettingIsEmptyArray() {
  const result = buildSidebarNavigation({
    settings: { sidebar_navigation_items: '[]' },
    isAuthenticated: false,
  });

  assert(result.length === 4, 'empty array should fall back to defaults');
  assert(result[0].id === 'home', 'defaults should include home');
})();

assert(true, 'sidebar navigation spec executed');

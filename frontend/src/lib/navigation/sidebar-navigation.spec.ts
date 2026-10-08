import {
  buildSidebarNavigation,
  parseSidebarNavigationItems,
  validateSidebarNavigation,
  DEFAULT_SIDEBAR_NAVIGATION,
  SIDEBAR_ICON_OPTIONS,
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

  assert(result.length === 5, 'the shipped defaults are five items');
  assertDeepEqual(
    result.map((i) => ({ id: i.id, label: i.label, href: i.href })),
    [
      { id: 'home', label: 'navigation.home', href: '/' },
      { id: 'categories', label: 'navigation.categories', href: '/categories' },
      { id: 'tags', label: 'navigation.tags', href: '/tags' },
      { id: 'resources', label: 'navigation.resources', href: '/resources' },
      { id: 'notices', label: 'navigation.announcements', href: '/notices' },
    ],
    'defaults should match the backend defaults, as locale keys',
  );
  // The previous expectation asserted four items, which silently hid that the
  // notices entry existed at all. Keep the count and the contents in step.
})();

// A default label is a locale key; an operator-authored label is displayed
// verbatim. Without the distinction the English site renders Chinese.
(function testDefaultLabelsResolveAndOperatorLabelsPassThrough() {
  const defaults = buildSidebarNavigation({ settings: {}, isAuthenticated: true, translate: (key) => `t:${key}` });
  assert(defaults.every((item) => item.label.startsWith('t:navigation.')), 'default labels should be resolved');

  const configured = buildSidebarNavigation({
    settings: {
      sidebar_navigation_items: JSON.stringify([
        { id: 'home', label: '首页', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
        { id: 'resources', label: 'navigation.resources', href: '/resources', icon: 'Book', enabled: true, requiresAuth: false },
      ]),
    },
    isAuthenticated: true,
    translate: (key) => `t:${key}`,
  });
  assert(configured.find((item) => item.id === 'home')?.label === '首页', 'operator labels should pass through');
  assert(configured.find((item) => item.id === 'resources')?.label === 't:navigation.resources', 'untouched defaults should resolve');
})();

(function testDefaultsIncludeAllWhenAuthenticated() {
  const result = buildSidebarNavigation({ settings: {}, isAuthenticated: true });
  assert(result.length === 5, 'authenticated users should see all five default items');
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

  // `buildSidebarNavigation` always guarantees `home` first and `notices`
  // right after it, so a configured list is padded rather than replaced.
  assertLength(result, 4, 'disabled items should be filtered out');
  assertDeepEqual(result.map((item) => item.id), ['home', 'notices', 'a', 'c'], 'disabled items should be filtered out');
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
  assertDeepEqual(anonResult.map((item) => item.id), ['home', 'notices', 'public'], 'anonymous users should not see requiresAuth items');

  const authResult = buildSidebarNavigation({
    settings: { sidebar_navigation_items: JSON.stringify(items) },
    isAuthenticated: true,
  });
  assertDeepEqual(authResult.map((item) => item.id), ['home', 'notices', 'public', 'private'], 'authenticated users should see all enabled items');
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

  assertDeepEqual(result.map((item) => item.id), ['home', 'notices', 'public-page', 'external'], 'anonymous users should not see auth-only prefix paths');
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

  assertDeepEqual(result.map((item) => item.id), ['home', 'notices', 'plain'], 'disabled features should be filtered out');
})();

(function testFeatureKeyDefaultEnabledWhenMissing() {
  const items: SidebarNavigationItem[] = [
    { id: 'x', label: 'X', href: '/x', icon: 'Home', enabled: true, requiresAuth: false, featureKey: 'feature_x_enabled' },
  ];

  const result = buildSidebarNavigation({
    settings: { sidebar_navigation_items: JSON.stringify(items) },
    isAuthenticated: false,
  });

  assertDeepEqual(result.map((item) => item.id), ['home', 'notices', 'x'], 'missing featureKey setting should default to enabled');
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

  assertDeepEqual(result.map((item) => item.id), ['home', 'notices', 'visible'], 'all filters should combine correctly');
})();

(function testFallbackWhenSettingIsEmptyArray() {
  const result = buildSidebarNavigation({
    settings: { sidebar_navigation_items: '[]' },
    isAuthenticated: false,
  });

  assertDeepEqual(result.map((item) => item.id), ['home', 'categories', 'tags', 'resources', 'notices'], 'empty array should fall back to defaults');
})();

// ─── validateSidebarNavigation ──────────────────────────────────────────────

(function testValidateAcceptsValidItems() {
  const items: SidebarNavigationItem[] = [
    { id: 'home', label: '首页', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
    { id: 'tags', label: '标签', href: '/tags', icon: 'Tag', enabled: true, requiresAuth: false },
  ];
  const result = validateSidebarNavigation(items);
  assert(result.valid === true, 'valid items should pass validation');
  assert(result.errors.length === 0, 'no errors for valid items');
})();

(function testValidateRejectsEmptyLabel() {
  const items: SidebarNavigationItem[] = [
    { id: 'home', label: '', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
  ];
  const result = validateSidebarNavigation(items);
  assert(result.valid === false, 'empty label should fail validation');
  assert(result.errors.some((e) => e.includes('label must not be empty')), 'error should mention empty label');
})();

(function testValidateRejectsEmptyHref() {
  const items: SidebarNavigationItem[] = [
    { id: 'home', label: '首页', href: '', icon: 'Home', enabled: true, requiresAuth: false },
  ];
  const result = validateSidebarNavigation(items);
  assert(result.valid === false, 'empty href should fail validation');
  assert(result.errors.some((e) => e.includes('link must not be empty')), 'error should mention empty href');
})();

(function testValidateRejectsDuplicateIds() {
  const items: SidebarNavigationItem[] = [
    { id: 'dup', label: 'A', href: '/a', icon: 'Home', enabled: true, requiresAuth: false },
    { id: 'dup', label: 'B', href: '/b', icon: 'Tag', enabled: true, requiresAuth: false },
  ];
  const result = validateSidebarNavigation(items);
  assert(result.valid === false, 'duplicate IDs should fail validation');
  assert(result.errors.some((e) => e.includes('Duplicate item id')), 'error should mention duplicate ID');
})();

(function testValidateRejectsInvalidIcon() {
  const items: SidebarNavigationItem[] = [
    { id: 'home', label: '首页', href: '/', icon: 'InvalidIcon', enabled: true, requiresAuth: false },
  ];
  const result = validateSidebarNavigation(items);
  assert(result.valid === false, 'invalid icon should fail validation');
  assert(result.errors.some((e) => e.includes('unsupported icon')), 'error should mention invalid icon');
})();

(function testValidateRejectsJavascriptHref() {
  const items: SidebarNavigationItem[] = [
    { id: 'xss', label: 'XSS', href: 'javascript:alert(1)', icon: 'Home', enabled: true, requiresAuth: false },
  ];
  const result = validateSidebarNavigation(items);
  assert(result.valid === false, 'javascript: href should fail validation');
  assert(result.errors.some((e) => e.includes('must start with / or https://')), 'error should mention invalid href');
})();

(function testValidateAcceptsHttpsHref() {
  const items: SidebarNavigationItem[] = [
    { id: 'ext', label: 'External', href: 'https://example.com', icon: 'ExternalLink', enabled: true, requiresAuth: false },
  ];
  const result = validateSidebarNavigation(items);
  assert(result.valid === true, 'https href should pass validation');
})();

(function testValidateRejectsHttpHref() {
  const items: SidebarNavigationItem[] = [
    { id: 'http', label: 'HTTP', href: 'http://example.com', icon: 'ExternalLink', enabled: true, requiresAuth: false },
  ];
  const result = validateSidebarNavigation(items);
  assert(result.valid === false, 'http (non-https) href should fail validation');
})();

(function testValidateEmptyArrayIsValid() {
  const result = validateSidebarNavigation([]);
  assert(result.valid === true, 'empty array should be valid');
})();

// ─── SIDEBAR_ICON_OPTIONS ───────────────────────────────────────────────────

(function testIconOptionsNotEmpty() {
  assert(SIDEBAR_ICON_OPTIONS.length > 0, 'icon options should not be empty');
  assert(SIDEBAR_ICON_OPTIONS.includes('Home'), 'icon options should include "Home"');
  assert(SIDEBAR_ICON_OPTIONS.includes('ExternalLink'), 'icon options should include "ExternalLink"');
  assert(SIDEBAR_ICON_OPTIONS.includes('LogOut'), 'icon options should include "LogOut"');
})();

// ─── DEFAULT_SIDEBAR_NAVIGATION ─────────────────────────────────────────────

(function testDefaultsExported() {
  assert(DEFAULT_SIDEBAR_NAVIGATION.length === 5, 'defaults should have 5 items');
  assert(DEFAULT_SIDEBAR_NAVIGATION[0].id === 'home', 'first default should be home');
})();

// Jest only picks up suites that register a test; the IIFE blocks above remain
// runnable as a plain script.
test('sidebar navigation model assertions executed', () => {
  assert(true, 'sidebar navigation spec executed');
});

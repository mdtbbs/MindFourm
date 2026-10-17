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

describe('sidebar navigation', () => {
  it('testParseEmptyAndInvalidInput', () => {
    assertDeepEqual(parseSidebarNavigationItems(undefined), [], 'undefined returns empty');
    assertDeepEqual(parseSidebarNavigationItems(''), [], 'empty string returns empty');
    assertDeepEqual(parseSidebarNavigationItems('not json'), [], 'malformed JSON returns empty');
    assertDeepEqual(parseSidebarNavigationItems('"string"'), [], 'non-array JSON returns empty');
    assertDeepEqual(parseSidebarNavigationItems('{}'), [], 'object JSON returns empty');
  });

  it('testParseValidItems', () => {
    const input: SidebarNavigationItem[] = [
      { id: 'home', label: '首页', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
      { id: 'tags', label: '标签', href: '/tags', icon: 'Tag', enabled: false, requiresAuth: false },
    ];
    const result = parseSidebarNavigationItems(JSON.stringify(input));
    assertLength(result, 2, 'valid items should be parsed');
    assert(result[0].id === 'home', 'first item id should be home');
    assert(result[1].enabled === false, 'second item should be disabled');
  });

  it('testParseDropsInvalidItems', () => {
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
  });

  // ─── buildSidebarNavigation — defaults ──────────────────────────────────────

  it('testDefaultsWhenNoSetting', () => {
    const result = buildSidebarNavigation({ settings: {}, isAuthenticated: false });

    assert(result.length === 5, 'default should have 5 items');
    assertDeepEqual(
      result.map((i) => ({ id: i.id, label: i.label, href: i.href })),
      [
        { id: 'home', label: '首页', href: '/' },
        { id: 'categories', label: '分类', href: '/categories' },
        { id: 'tags', label: '标签', href: '/tags' },
        { id: 'resources', label: '资源中心', href: '/resources' },
        { id: 'notices', label: '公告中心', href: '/notices' },
      ],
      'defaults should match the backend defaults',
    );
  });

  it('testDefaultsIncludeAllWhenAuthenticated', () => {
    const result = buildSidebarNavigation({ settings: {}, isAuthenticated: true });
    assert(result.length === 5, 'authenticated users should see all 5 default items');
  });

  // ─── buildSidebarNavigation — enabled filter ────────────────────────────────

  it('testDisabledItemsAreFiltered', () => {
    const items: SidebarNavigationItem[] = [
      { id: 'a', label: 'A', href: '/a', icon: 'Home', enabled: true, requiresAuth: false },
      { id: 'b', label: 'B', href: '/b', icon: 'Tag', enabled: false, requiresAuth: false },
      { id: 'c', label: 'C', href: '/c', icon: 'Book', enabled: true, requiresAuth: false },
    ];
    const result = buildSidebarNavigation({
      settings: { sidebar_navigation_items: JSON.stringify(items) },
      isAuthenticated: false,
    });

    assertLength(result, 4, 'only the disabled item should be filtered out');
    assertDeepEqual(
      result.map((i) => i.id),
      ['home', 'notices', 'a', 'c'],
      'home and notices are seeded ahead of a custom list that omits them',
    );
  });

  // ─── buildSidebarNavigation — requiresAuth filter ───────────────────────────

  it('testRequiresAuthFiltersAnonymousUsers', () => {
    const items: SidebarNavigationItem[] = [
      { id: 'public', label: 'Public', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
      { id: 'private', label: 'Private', href: '/dashboard', icon: 'Settings', enabled: true, requiresAuth: true },
    ];

    const anonResult = buildSidebarNavigation({
      settings: { sidebar_navigation_items: JSON.stringify(items) },
      isAuthenticated: false,
    });
    assertLength(anonResult, 3, 'anonymous users should not see requiresAuth items');
    assertDeepEqual(
      anonResult.map((i) => i.id),
      ['home', 'notices', 'public'],
      'only the public item survives alongside the home/notices defaults',
    );

    const authResult = buildSidebarNavigation({
      settings: { sidebar_navigation_items: JSON.stringify(items) },
      isAuthenticated: true,
    });
    assertLength(authResult, 4, 'authenticated users should see all enabled items');
  });

  // ─── buildSidebarNavigation — anonymous href safety ─────────────────────────

  it('testAnonymousUsersCannotSeeAuthOnlyPaths', () => {
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

    assertLength(result, 4, 'anonymous users should not see auth-only prefix paths');
    assertDeepEqual(
      result.map((i) => i.id),
      ['home', 'notices', 'public-page', 'external'],
      'public and external links should stay visible',
    );
  });

  // ─── buildSidebarNavigation — featureKey filter ─────────────────────────────

  it('testFeatureKeyFiltersDisabledFeatures', () => {
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

    assertLength(result, 3, 'disabled features should be filtered out');
    assertDeepEqual(
      result.map((i) => i.id),
      ['home', 'notices', 'plain'],
      'only the item without a disabled featureKey should remain',
    );
  });

  it('testFeatureKeyDefaultEnabledWhenMissing', () => {
    const items: SidebarNavigationItem[] = [
      { id: 'x', label: 'X', href: '/x', icon: 'Home', enabled: true, requiresAuth: false, featureKey: 'feature_x_enabled' },
    ];

    const result = buildSidebarNavigation({
      settings: { sidebar_navigation_items: JSON.stringify(items) },
      isAuthenticated: false,
    });

    assertLength(result, 3, 'missing featureKey setting should default to enabled');
  });

  // ─── buildSidebarNavigation — combined filters ──────────────────────────────

  it('testCombinedFilters', () => {
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

    assertLength(result, 3, 'all filters should combine correctly');
    assertDeepEqual(
      result.map((i) => i.id),
      ['home', 'notices', 'visible'],
      'only the fully-visible item plus the home/notices defaults should remain',
    );
  });

  it('testFallbackWhenSettingIsEmptyArray', () => {
    const result = buildSidebarNavigation({
      settings: { sidebar_navigation_items: '[]' },
      isAuthenticated: false,
    });

    assert(result.length === 5, 'empty array should fall back to defaults');
    assert(result[0].id === 'home', 'defaults should include home');
    assert(result[4].id === 'notices', 'defaults should include notices');
  });

  // ─── validateSidebarNavigation ──────────────────────────────────────────────

  it('testValidateAcceptsValidItems', () => {
    const items: SidebarNavigationItem[] = [
      { id: 'home', label: '首页', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
      { id: 'tags', label: '标签', href: '/tags', icon: 'Tag', enabled: true, requiresAuth: false },
    ];
    const result = validateSidebarNavigation(items);
    assert(result.valid === true, 'valid items should pass validation');
    assert(result.errors.length === 0, 'no errors for valid items');
  });

  it('testValidateRejectsEmptyLabel', () => {
    const items: SidebarNavigationItem[] = [
      { id: 'home', label: '', href: '/', icon: 'Home', enabled: true, requiresAuth: false },
    ];
    const result = validateSidebarNavigation(items);
    assert(result.valid === false, 'empty label should fail validation');
    assert(result.errors.some((e) => e.includes('标签不能为空')), 'error should mention empty label');
  });

  it('testValidateRejectsEmptyHref', () => {
    const items: SidebarNavigationItem[] = [
      { id: 'home', label: '首页', href: '', icon: 'Home', enabled: true, requiresAuth: false },
    ];
    const result = validateSidebarNavigation(items);
    assert(result.valid === false, 'empty href should fail validation');
    assert(result.errors.some((e) => e.includes('链接不能为空')), 'error should mention empty href');
  });

  it('testValidateRejectsDuplicateIds', () => {
    const items: SidebarNavigationItem[] = [
      { id: 'dup', label: 'A', href: '/a', icon: 'Home', enabled: true, requiresAuth: false },
      { id: 'dup', label: 'B', href: '/b', icon: 'Tag', enabled: true, requiresAuth: false },
    ];
    const result = validateSidebarNavigation(items);
    assert(result.valid === false, 'duplicate IDs should fail validation');
    assert(result.errors.some((e) => e.includes('重复 ID')), 'error should mention duplicate ID');
  });

  it('testValidateRejectsInvalidIcon', () => {
    const items: SidebarNavigationItem[] = [
      { id: 'home', label: '首页', href: '/', icon: 'InvalidIcon', enabled: true, requiresAuth: false },
    ];
    const result = validateSidebarNavigation(items);
    assert(result.valid === false, 'invalid icon should fail validation');
    assert(result.errors.some((e) => e.includes('无效图标')), 'error should mention invalid icon');
  });

  it('testValidateRejectsJavascriptHref', () => {
    const items: SidebarNavigationItem[] = [
      { id: 'xss', label: 'XSS', href: 'javascript:alert(1)', icon: 'Home', enabled: true, requiresAuth: false },
    ];
    const result = validateSidebarNavigation(items);
    assert(result.valid === false, 'javascript: href should fail validation');
    assert(result.errors.some((e) => e.includes('链接无效')), 'error should mention invalid href');
  });

  it('testValidateAcceptsHttpsHref', () => {
    const items: SidebarNavigationItem[] = [
      { id: 'ext', label: 'External', href: 'https://example.com', icon: 'ExternalLink', enabled: true, requiresAuth: false },
    ];
    const result = validateSidebarNavigation(items);
    assert(result.valid === true, 'https href should pass validation');
  });

  it('testValidateRejectsHttpHref', () => {
    const items: SidebarNavigationItem[] = [
      { id: 'http', label: 'HTTP', href: 'http://example.com', icon: 'ExternalLink', enabled: true, requiresAuth: false },
    ];
    const result = validateSidebarNavigation(items);
    assert(result.valid === false, 'http (non-https) href should fail validation');
  });

  it('testValidateEmptyArrayIsValid', () => {
    const result = validateSidebarNavigation([]);
    assert(result.valid === true, 'empty array should be valid');
  });

  // ─── SIDEBAR_ICON_OPTIONS ───────────────────────────────────────────────────

  it('testIconOptionsNotEmpty', () => {
    assert(SIDEBAR_ICON_OPTIONS.length > 0, 'icon options should not be empty');
    assert(SIDEBAR_ICON_OPTIONS.includes('Home'), 'icon options should include "Home"');
    assert(SIDEBAR_ICON_OPTIONS.includes('ExternalLink'), 'icon options should include "ExternalLink"');
    assert(SIDEBAR_ICON_OPTIONS.includes('LogOut'), 'icon options should include "LogOut"');
  });

  // ─── DEFAULT_SIDEBAR_NAVIGATION ─────────────────────────────────────────────

  it('testDefaultsExported', () => {
    assert(DEFAULT_SIDEBAR_NAVIGATION.length === 5, 'defaults should have 5 items');
    assert(DEFAULT_SIDEBAR_NAVIGATION[0].id === 'home', 'first default should be home');
  });


});

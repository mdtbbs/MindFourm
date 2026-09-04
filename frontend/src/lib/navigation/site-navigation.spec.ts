import { filterTopNavigationItemsBySettings, type TopNavigationItem } from './top-navigation';
import { buildSiteNavigationModel } from './site-navigation';

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

(function testAnonymousDefaultModel() {
  const model = buildSiteNavigationModel({
    settings: {},
    isAuthenticated: false,
  });

  assertDeepEqual(
    model.primaryItems.map((item) => ({ label: item.label, href: item.href })),
    [{ label: '首页', href: '/' }, { label: '资源中心', href: '/resources' }],
    'anonymous users should receive enabled top-level primary items only',
  );

  assertDeepEqual(
    model.groups.map((group) => ({
      label: group.label,
      items: group.items.map((item) => ({ label: item.label, href: item.href })),
    })),
    [{
      label: '社区',
      items: [
        { label: '用户组', href: '/groups' },
        { label: '积分排行', href: '/leaderboard' },
        { label: '积分商店', href: '/shop' },
      ],
    }],
    'anonymous users should keep configured groups with enabled child links',
  );

  assertDeepEqual(model.personalItems, [], 'anonymous users should not see personal items');
  assertDeepEqual(
    model.quickActions,
    [
      { label: '登录', action: 'login', variant: 'primary' },
      { label: '注册', action: 'register', variant: 'secondary' },
    ],
    'anonymous users should receive login/register quick actions',
  );
})();

(function testAnonymousModelFiltersConfiguredPrivateLinks() {
  const model = buildSiteNavigationModel({
    settings: {
      top_navigation_items: JSON.stringify([
        { type: 'link', label: '通知中心', href: '/notifications' },
        {
          type: 'group',
          label: '个人',
          items: [
            { label: '消息', href: '/messages' },
            { label: '公开文档', href: 'https://example.com/docs', newTab: true },
          ],
        },
      ]),
    },
    isAuthenticated: false,
  });

  assertDeepEqual(
    model.primaryItems,
    [{ label: '首页', href: '/', icon: 'home' }],
    'anonymous users should not receive configured private top-level links',
  );

  assertDeepEqual(
    model.groups,
    [{
      label: '个人',
      items: [{ label: '公开文档', href: 'https://example.com/docs', newTab: true }],
    }],
    'anonymous users should keep only anonymous-safe configured group links',
  );
})();

(function testAuthenticatedModelAddsPersonalAndQuickActions() {
  const model = buildSiteNavigationModel({
    settings: {},
    isAuthenticated: true,
  });

  assertDeepEqual(
    model.personalItems,
    [
      { label: '通知', href: '/notifications', icon: 'bell', requiresAuth: true },
      { label: '消息', href: '/messages', icon: 'mail', requiresAuth: true },
      { label: '好友', href: '/friends', icon: 'users', requiresAuth: true },
      { label: '书签', href: '/bookmarks', icon: 'bookmark', requiresAuth: true },
      { label: '设置', href: '/settings', icon: 'settings', requiresAuth: true },
    ],
    'authenticated users should receive fixed personal items with icons',
  );

  assertDeepEqual(
    model.quickActions,
    [
      { label: '发帖', href: '/posts/new', requiresAuth: true, variant: 'primary' },
      { label: '提交资源', href: '/resources/submit', requiresAuth: true, variant: 'secondary' },
    ],
    'authenticated users should receive post and resource quick actions',
  );
})();

(function testFeatureFilteringAppliesToDescendantPathsAndQuickActions() {
  const model = buildSiteNavigationModel({
    settings: {
      top_navigation_items: JSON.stringify([
        { type: 'link', label: '资源管理', href: '/resources/manage' },
        {
          type: 'group',
          label: '自定义',
          items: [
            { label: '用户组广场', href: '/groups/discover' },
            { label: '文档', href: 'https://example.com/docs', newTab: true },
          ],
        },
        { type: 'link', label: 'LanLink 房间', href: '/lanlink/rooms' },
      ]),
      feature_resources_enabled: 'false',
      feature_groups_enabled: 'false',
      feature_lanlink_enabled: 'false',
    },
    isAuthenticated: true,
  });

  assertDeepEqual(
    model.primaryItems,
    [{ label: '首页', href: '/', icon: 'home' }],
    'disabled feature descendants should be removed from primary items',
  );

  assertDeepEqual(
    model.groups,
    [{
      label: '自定义',
      items: [{ label: '文档', href: 'https://example.com/docs', newTab: true }],
    }],
    'groups should preserve label and external children while removing disabled feature descendants',
  );

  assertDeepEqual(
    model.quickActions,
    [{ label: '发帖', href: '/posts/new', requiresAuth: true, variant: 'primary' }],
    'resource quick action should disappear when the resources feature is disabled',
  );
})();

(function testTopNavigationFilteringRecognizesDescendantFeaturePaths() {
  const items: TopNavigationItem[] = [
    { type: 'link', label: '资源设置', href: '/resources/manage' },
    {
      type: 'group',
      label: '社区工具',
      items: [
        { label: '商店订单', href: '/shop/orders' },
        { label: '帮助', href: 'https://example.com/help' },
      ],
    },
  ];

  const filtered = filterTopNavigationItemsBySettings(items, {
    feature_resources_enabled: 'false',
    feature_shop_enabled: 'false',
  });

  assertDeepEqual(
    filtered,
    [{
      type: 'group',
      label: '社区工具',
      items: [{ label: '帮助', href: 'https://example.com/help' }],
    }],
    'top-navigation filtering should remove disabled feature descendants and preserve unrelated links',
  );
})();

assert(true, 'site navigation spec executed');

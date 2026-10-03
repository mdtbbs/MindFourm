import { resolveQuickOpenCommand, type QuickOpenCommandAliases, type QuickOpenPage } from '@/lib/admin/command-palette';

const aliases: QuickOpenCommandAliases = {
  user: 'user',
  resource: 'resource',
  post: 'post',
  thread: 'thread',
  setting: 'setting',
  page: 'page',
  requestId: 'request_id',
  moderation: 'moderation',
  settingsAlias: 'settings',
  resourcesAlias: 'resources',
  moderationQueueAlias: 'queue',
};

const pages: QuickOpenPage[] = [
  { key: 'dashboard', label: 'Dashboard', description: 'Overview', href: '/admin', haystack: 'overview dashboard' },
  { key: 'basic', label: 'Basic settings', description: 'System', href: '/admin/settings/basic', haystack: 'system basic settings' },
  { key: 'brand', label: 'Brand settings', description: 'System', href: '/admin/settings/brand', haystack: 'system brand settings' },
  { key: 'pending', label: 'Planned', description: 'Developers', href: '', haystack: 'planned', disabled: true },
];

describe('admin command palette quick-open routes', () => {
  it('keeps user and resource commands as search-only destinations', () => {
    expect(resolveQuickOpenCommand('user Alice Smith', aliases, pages)).toEqual([
      { type: 'user', value: 'Alice Smith', href: '/admin/users?search=Alice%20Smith' },
    ]);
    expect(resolveQuickOpenCommand('resource map pack', aliases, pages)).toEqual([
      { type: 'resource', value: 'map pack', href: '/admin/resources?search=map%20pack' },
    ]);
  });

  it('opens only numeric post or thread IDs', () => {
    expect(resolveQuickOpenCommand('thread 123', aliases, pages)).toEqual([
      { type: 'post', value: '123', href: '/posts/123' },
    ]);
    expect(resolveQuickOpenCommand('post 0', aliases, pages)).toEqual([]);
    expect(resolveQuickOpenCommand('post remove 123', aliases, pages)).toEqual([]);
  });

  it('targets request logs and moderation queues with their supported filters', () => {
    expect(resolveQuickOpenCommand('request_id req-42/abc', aliases, pages)).toEqual([
      { type: 'requestId', value: 'req-42/abc', href: '/admin/logs?request_id=req-42%2Fabc' },
    ]);
    expect(resolveQuickOpenCommand('moderation', aliases, pages)).toEqual([
      { type: 'moderation', filter: 'all', href: '/admin/content/moderation?type=all' },
    ]);
    expect(resolveQuickOpenCommand('moderation queue', aliases, pages)).toEqual([
      { type: 'moderation', filter: 'all', href: '/admin/content/moderation?type=all' },
    ]);
    expect(resolveQuickOpenCommand('moderation resources', aliases, pages)).toEqual([
      { type: 'moderation', filter: 'resources', href: '/admin/content/moderation?type=resources' },
    ]);
  });

  it('opens a named setting or the settings page through page command', () => {
    expect(resolveQuickOpenCommand('setting brand', aliases, pages)).toEqual([
      { type: 'setting', value: 'brand', page: pages[2], href: '/admin/settings/brand' },
    ]);
    expect(resolveQuickOpenCommand('page settings', aliases, pages)).toEqual([
      { type: 'page', value: 'settings', page: pages[1], href: '/admin/settings/basic' },
    ]);
  });

  it('supports localized command prefixes', () => {
    const chineseAliases = { ...aliases, post: '帖子', thread: '主题', setting: '设置', page: '页面', settingsAlias: '设置' };
    expect(resolveQuickOpenCommand('主题 321', chineseAliases, pages, 'zh-CN')).toEqual([
      { type: 'post', value: '321', href: '/posts/321' },
    ]);
    expect(resolveQuickOpenCommand('页面 设置', chineseAliases, pages, 'zh-CN')).toEqual([
      { type: 'page', value: '设置', page: pages[1], href: '/admin/settings/basic' },
    ]);
  });
});

import { isWorkspaceActive, resolveWorkspace, resolveWorkspaceBreadcrumb, WORKSPACE_SPACES } from './workspace-navigation';

describe('workspace navigation', () => {
  test('defines the six stable primary spaces in IA order', () => {
    expect(WORKSPACE_SPACES.map(({ id, href }) => [id, href])).toEqual([
      ['home', '/'], ['community', '/community'], ['resources', '/resources'],
      ['multiplayer', '/multiplayer'], ['tools', '/tools'], ['me', '/me'],
    ]);
  });

  test.each([
    ['/threads/42', 'community'], ['/resources/example/workbench', 'resources'],
    ['/resources/my', 'me'], ['/friends', 'multiplayer'], ['/tools/cloud-saves', 'tools'],
    ['/developers', 'tools'], ['/api/v1/reference', 'tools'], ['/users/8', 'community'],
  ])('routes %s to the %s workspace', (route, expected) => {
    expect(resolveWorkspace(route)).toBe(expected);
  });

  test('marks the current user profile as part of My and keeps a short breadcrumb', () => {
    expect(resolveWorkspace('/users/8', 8)).toBe('me');
    expect(isWorkspaceActive('/resources/my', '/me')).toBe(true);
    expect(isWorkspaceActive('/tools/map-editor', '/tools')).toBe(true);
    expect(resolveWorkspaceBreadcrumb('/tools/map-editor')).toEqual([
      { labelKey: 'navigation.tools', href: '/tools' },
      { labelKey: 'tools.mapEditor' },
    ]);
  });
});

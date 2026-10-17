export type WorkspaceId = 'home' | 'community' | 'resources' | 'multiplayer' | 'tools' | 'me';

export const WORKSPACE_SPACES: ReadonlyArray<{ id: WorkspaceId; href: string; labelKey: string }> = [
  { id: 'home', href: '/', labelKey: 'navigation.home' },
  { id: 'community', href: '/community', labelKey: 'navigation.community' },
  { id: 'resources', href: '/resources', labelKey: 'navigation.resources' },
  { id: 'multiplayer', href: '/multiplayer', labelKey: 'navigation.multiplayer' },
  { id: 'tools', href: '/tools', labelKey: 'navigation.tools' },
  { id: 'me', href: '/me', labelKey: 'navigation.me' },
];

const ROUTE_SPACE_PREFIXES: ReadonlyArray<[string, WorkspaceId]> = [
  ['/community', 'community'], ['/threads', 'community'], ['/categories', 'community'],
  ['/tags', 'community'], ['/notices', 'community'], ['/posts', 'community'],
  ['/discover', 'community'], ['/groups', 'community'], ['/leaderboard', 'community'], ['/shop', 'community'],
  ['/developers', 'tools'], ['/api', 'tools'], ['/resources/my', 'me'], ['/resources', 'resources'], ['/multiplayer', 'multiplayer'], ['/servers', 'multiplayer'],
  ['/friends', 'multiplayer'], ['/lanlink', 'multiplayer'], ['/tools', 'tools'],
  ['/me', 'me'], ['/notifications', 'me'], ['/bookmarks', 'me'], ['/messages', 'me'],
  ['/settings', 'me'], ['/users/me', 'me'],
];

export function resolveWorkspace(pathname: string | null | undefined, userId?: number): WorkspaceId {
  if (!pathname || pathname === '/') return 'home';
  if (userId && pathname === `/users/${userId}`) return 'me';
  return ROUTE_SPACE_PREFIXES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1]
    ?? (pathname.startsWith('/users/') ? 'community' : 'home');
}

export function isWorkspaceActive(pathname: string | null | undefined, href: string, userId?: number): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  const id = WORKSPACE_SPACES.find((space) => space.href === href)?.id;
  return id ? resolveWorkspace(pathname, userId) === id : pathname === href || pathname.startsWith(`${href}/`);
}

export function resolveWorkspaceBreadcrumb(pathname: string | null | undefined, userId?: number): Array<{ labelKey: string; href?: string }> {
  const path = pathname || '/';
  const space = resolveWorkspace(path, userId);
  const root = WORKSPACE_SPACES.find((item) => item.id === space)!;
  if (path === root.href) return [{ labelKey: root.labelKey }];

  const pageKey = path.startsWith('/threads') ? 'navigation.latest'
    : path.startsWith('/categories') ? 'navigation.categories'
      : path.startsWith('/tags') ? 'navigation.tags'
        : path.startsWith('/notices') ? 'navigation.announcements'
          : path.startsWith('/posts') ? 'navigation.discussion'
            : path.startsWith('/resources/my') ? 'navigation.myResources'
              : path.startsWith('/resources/submit') ? 'navigation.uploadResource'
                : path.startsWith('/resources/') ? 'navigation.resourceDetails'
                  : path.startsWith('/servers') ? 'navigation.servers'
                    : path.startsWith('/friends') ? 'navigation.friends'
                      : path.startsWith('/lanlink') ? 'navigation.lobby'
                        : path.startsWith('/notifications') ? 'navigation.notifications'
                          : path.startsWith('/bookmarks') ? 'navigation.bookmarks'
                            : path.startsWith('/messages') ? 'navigation.messages'
                              : path.startsWith('/settings') || path.startsWith('/users/me') ? 'navigation.settings'
                                : path.startsWith('/users/') ? 'navigation.profile'
                                  : path.startsWith('/tools/cloud-saves') ? 'tools.cloudSaves'
                                    : path.startsWith('/tools/blueprint-editor') ? 'tools.blueprintEditor'
                                      : path.startsWith('/tools/map-editor') ? 'tools.mapEditor'
                                        : path.startsWith('/tools/wave-editor') ? 'tools.waveEditor'
                                  : path.startsWith('/tools/blueprint-analysis') ? 'tools.blueprintAnalysis'
                                            : path.startsWith('/tools') ? 'tools.title'
                                              : path.startsWith('/multiplayer') ? 'multiplayer.title'
                                                : path.startsWith('/community') ? 'community.title'
                                                  : path.startsWith('/developers') ? 'navigation.developerCenter'
                                                    : path.startsWith('/api/v1') ? 'searchCommand.apiDocs'
                                                    : 'navigation.page';
  return [{ labelKey: root.labelKey, href: root.href }, { labelKey: pageKey }];
}

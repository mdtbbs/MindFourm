import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SIDEBAR_LAYOUT_CLASSES } from './content-sidebar';
import ContentSidebar from './content-sidebar';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, ...props }: { href: string; [key: string]: unknown }) => require('react').createElement('a', { href, ...props }),
}));
jest.mock('next/navigation', () => ({ usePathname: () => '/tools/map-editor' }));
jest.mock('@/i18n/provider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

describe('ContentSidebar layout', () => {
  test('fills the shell height instead of pinning a sticky viewport rail', () => {
    // The shell owns the viewport height (`lg:h-dvh`); the rail follows it with
    // `lg:h-full`. A sticky/100dvh rail would stay pinned on long pages and
    // leave a dead column below short ones.
    expect(SIDEBAR_LAYOUT_CLASSES.root).toContain('lg:h-full');
    expect(SIDEBAR_LAYOUT_CLASSES.root).toContain('lg:overflow-hidden');
    expect(SIDEBAR_LAYOUT_CLASSES.root).not.toContain('lg:sticky');
    expect(SIDEBAR_LAYOUT_CLASSES.root).not.toContain('lg:h-[100dvh]');
    expect(SIDEBAR_LAYOUT_CLASSES.nav).toContain('overflow-y-auto');
    expect(SIDEBAR_LAYOUT_CLASSES.nav).toContain('min-h-0');
  });

  test('keeps brand and user areas fixed while the navigation scrolls', () => {
    expect(SIDEBAR_LAYOUT_CLASSES.brand).toContain('shrink-0');
    expect(SIDEBAR_LAYOUT_CLASSES.user).toContain('shrink-0');
  });

  test('renders the six fixed spaces and marks the active Tools workspace', () => {
    const html = renderToStaticMarkup(createElement(ContentSidebar, { siteName: 'MDTBBS' }));
    const nav = html.match(/<nav[^>]*data-testid="sidebar-nav"[^>]*>(.*?)<\/nav>/)?.[1] || '';
    const hrefs = Array.from(nav.matchAll(/href="([^"]+)"/g), (match) => match[1]);
    expect(hrefs).toEqual(['/', '/community', '/resources', '/multiplayer', '/tools', '/me']);
    expect(nav).toContain('aria-current="page"');
    expect(nav).not.toContain('/categories');
    expect(nav).not.toContain('/tags');
  });
});

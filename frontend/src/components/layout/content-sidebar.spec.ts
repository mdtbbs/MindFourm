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
  test('keeps the shell viewport bound and lets only the navigation region scroll', () => {
    expect(SIDEBAR_LAYOUT_CLASSES.root).toContain('lg:h-[100dvh]');
    expect(SIDEBAR_LAYOUT_CLASSES.root).toContain('lg:overflow-hidden');
    expect(SIDEBAR_LAYOUT_CLASSES.root).not.toContain('lg:min-h-screen');
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

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MobileBottomNavigation from './mobile-bottom-navigation';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, ...props }: { href: string; [key: string]: unknown }) => require('react').createElement('a', { href, ...props }),
}));
jest.mock('next/navigation', () => ({ usePathname: () => '/multiplayer' }));
jest.mock('@/i18n/provider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

test('mobile navigation uses the five task-focused tabs and marks active space', () => {
  const html = renderToStaticMarkup(createElement(MobileBottomNavigation, {}));
  const hrefs = Array.from(html.matchAll(/href="([^"]+)"/g), (match) => match[1]);
  expect(hrefs).toEqual(['/', '/community', '/resources', '/multiplayer', '/me']);
  expect(html).toContain('aria-current="page"');
  expect(html).not.toContain('href="/tools"');
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ContentNavigation from './content-navigation';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, ...props }: { href: string; [key: string]: unknown }) => require('react').createElement('a', { href, ...props }),
}));
jest.mock('next/navigation', () => ({ usePathname: () => '/resources', useSearchParams: () => new URLSearchParams() }));
jest.mock('@/i18n/provider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const forumCategories = [
  { id: 1, name: '讨论交流', slug: 'talk', description: null, icon: null, sort_order: 1, is_active: true, created_at: '', post_count: 16 },
];

describe('ContentNavigation context sections', () => {
  test('renders resource kinds expanded on first paint', () => {
    const html = renderToStaticMarkup(createElement(ContentNavigation, {
      mode: 'resources', settings: {}, isAuthenticated: false,
    }));
    expect(html).toContain('href="/resources?resource_kind=map"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('aria-expanded="false"');
  });

  test('renders discussion boards expanded on first paint', () => {
    const html = renderToStaticMarkup(createElement(ContentNavigation, {
      mode: 'forum', settings: {}, isAuthenticated: false, forumCategories,
    }));
    expect(html).toContain('href="/categories/1"');
    expect(html).toContain('讨论交流');
    expect(html).not.toContain('aria-expanded="false"');
  });

  test('keeps the heading as the control for collapsing the section', () => {
    const html = renderToStaticMarkup(createElement(ContentNavigation, {
      mode: 'forum', settings: {}, isAuthenticated: false, forumCategories,
    }));
    // The heading is the only toggle; the list itself must not swallow clicks.
    expect(html).toContain('aria-expanded="true"');
    expect((html.match(/aria-expanded/g) || []).length).toBe(1);
  });
});

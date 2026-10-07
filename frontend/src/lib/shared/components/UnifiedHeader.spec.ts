import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UnifiedHeader } from './UnifiedHeader';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: unknown; [key: string]: unknown }) =>
    require('react').createElement('a', { href, ...props }, children),
}));
jest.mock('../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggle: jest.fn() }) }));

test('top bar exposes desktop and mobile global search triggers alongside the create entry', () => {
  const html = renderToStaticMarkup(createElement(UnifiedHeader, {
    showSearch: true,
    onOpenSearch: jest.fn(),
    createMenuSlot: createElement('button', { 'aria-label': 'Create', 'data-testid': 'create-entry' }, 'Create'),
  }));
  expect(html).toContain('data-testid="global-search-trigger-desktop"');
  expect(html).toContain('data-testid="global-search-trigger-mobile"');
  expect(html).toContain('aria-keyshortcuts="Control+K Meta+K"');
  expect(html).toContain('data-testid="create-entry"');
});

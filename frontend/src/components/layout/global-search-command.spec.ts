import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GlobalSearchCommand from './global-search-command';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('@/i18n/provider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

test('open command palette renders a labelled dialog and a combobox', () => {
  const html = renderToStaticMarkup(createElement(GlobalSearchCommand, {
    open: true,
    onClose: jest.fn(),
    onOpenChange: jest.fn(),
  }));
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-modal="true"');
  expect(html).toContain('role="combobox"');
  expect(html).toContain('aria-keyshortcuts');
});

test('closed command palette adds no overlay to the app shell', () => {
  const html = renderToStaticMarkup(createElement(GlobalSearchCommand, {
    open: false,
    onClose: jest.fn(),
    onOpenChange: jest.fn(),
  }));
  expect(html).toBe('');
});

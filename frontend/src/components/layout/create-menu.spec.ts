import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CreateMenu from './create-menu';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, ...props }: { href: string; [key: string]: unknown }) => require('react').createElement('a', { href, ...props }),
}));
jest.mock('@/i18n/provider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

test('create entry is labelled, touch-sized, and announces its dialog relationship', () => {
  const html = renderToStaticMarkup(createElement(CreateMenu, { isAuthenticated: false }));
  expect(html).toContain('aria-label="create.title"');
  expect(html).toContain('aria-haspopup="dialog"');
  expect(html).toContain('min-h-11');
});

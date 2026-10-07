import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ToolCenter from './tool-center';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, ...props }: { href: string; [key: string]: unknown }) => require('react').createElement('a', { href, ...props }),
}));
jest.mock('@/i18n/provider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

test('toolbox exposes workbench guides and the new cloud-save route', () => {
  const html = renderToStaticMarkup(createElement(ToolCenter));
  for (const route of [
    '/tools/blueprint-editor', '/tools/map-editor', '/tools/wave-editor',
    '/tools/blueprint-analysis', '/tools/cloud-saves',
  ]) expect(html).toContain(`href="${route}"`);
  expect(html).toContain('tools.recentEmpty');
});

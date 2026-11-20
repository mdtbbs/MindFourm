import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Resource } from '@/types';
import ResourceActions from './resource-actions';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => require('react').createElement('a', { href, ...props }, children),
}));
jest.mock('@/i18n/provider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
jest.mock('./resource-overflow-menu', () => () => null);

it('opens a map version directly in the independent editor with a refreshable URL', () => {
  const resource = {
    id: 12, public_id: 'map-public-id', resource_type: 'upload', resource_kind: 'map',
    versions: [{ id: 9, public_id: 'old-version-public-id' }, { id: 12, public_id: 'map-version-public-id' }],
  } as unknown as Resource;
  const html = renderToStaticMarkup(createElement(ResourceActions, {
    resource, downloadUrl: '/map.msav', downloadLabel: '下载地图', primaryVersionId: 12,
    isSchematic: false, schematicCopied: false, favorite: false, favoriteCount: 0,
    liked: false, likeCount: 0, subscribed: false, busy: false, copied: false,
    onCopySchematic: () => {}, onFavorite: () => {}, onLike: () => {}, onSubscribe: () => {}, onShare: () => {}, canManage: false,
  }));
  expect(html).toContain('href="/tools/map-editor?resource=map-public-id&amp;version=map-version-public-id"');
  expect(html).toContain('在地图编辑器中打开');
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HomeBoardGrid from './home-board-grid';
import HomeStatsStrip from './home-stats-strip';
import HomeResourceKinds from './home-resource-kinds';
import type { HomeBoard } from '@/lib/api/v1/home';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, ...props }: { href: string; [key: string]: unknown }) => require('react').createElement('a', { href, ...props }),
}));

const boards: HomeBoard[] = [
  { id: 1, name: '讨论交流', slug: 'talk', icon: null, color: null, description: null, group: 'community', post_count: 12, depth: 0 },
  { id: 2, name: '子版块', slug: 'sub', icon: null, color: null, description: null, group: 'community', post_count: 2, depth: 1 },
];

describe('homepage portal sections', () => {
  test('renders every board it is given, children included, and links to the board page', () => {
    const html = renderToStaticMarkup(createElement(HomeBoardGrid, { boards, title: '社区版块' }));
    expect(Array.from(html.matchAll(/href="([^"]+)"/g), (match) => match[1])).toEqual(['/categories', '/categories/1', '/categories/2']);
    expect(html).toContain('讨论交流');
    expect(html).toContain('子版块');
    // A sub-board must stay visually subordinate instead of starting a new group.
    expect(html).toContain('sm:ml-4');
  });

  test('an empty board list degrades to a message rather than a bare heading', () => {
    const html = renderToStaticMarkup(createElement(HomeBoardGrid, { boards: [], title: '社区版块' }));
    expect(html).toContain('暂时没有可浏览的版块');
    expect(html).not.toContain('全部分类');
  });

  test('stats and resource kinds disappear entirely when the server has nothing', () => {
    expect(renderToStaticMarkup(createElement(HomeStatsStrip, { stats: null, labels: { posts: '主题', replies: '回复', members: '成员', resources: '资源', today: '今日新帖' } }))).toBe('');
    expect(renderToStaticMarkup(createElement(HomeResourceKinds, { kinds: [], title: '资源分类' }))).toBe('');
  });

  test('stats render locale-formatted numbers, and kinds keep the registry order', () => {
    const stats = renderToStaticMarkup(createElement(HomeStatsStrip, { stats: { posts: 46193, replies: 1200, members: 211603, resources: 9, today_posts: 28 }, labels: { posts: '主题', replies: '回复', members: '成员', resources: '资源', today: '今日新帖' } }));
    expect(stats).toContain('46,193');
    const kinds = renderToStaticMarkup(createElement(HomeResourceKinds, { kinds: [{ kind: 'mod', label: 'Mod', count: 3 }, { kind: 'save', label: '存档', count: 1 }], title: '资源分类' }));
    expect(Array.from(kinds.matchAll(/href="([^"]+)"/g), (match) => match[1])).toEqual(['/resources', '/resources?resource_kind=mod', '/resources?resource_kind=save']);
  });
});

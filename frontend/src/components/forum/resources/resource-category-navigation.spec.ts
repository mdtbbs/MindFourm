import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ResourceCategoryNavigation from './resource-category-navigation';

describe('ResourceCategoryNavigation', () => {
  it('renders the four peer resource categories with equal card layout', () => {
    const html = renderToStaticMarkup(createElement(ResourceCategoryNavigation, {
      ariaLabel: 'Resource categories',
      selectedKind: 'map',
      labels: { mod: 'Mod', schematic: 'Blueprint', map: 'Map', pack: 'Pack' },
    }));

    for (const kind of ['mod', 'schematic', 'map', 'pack']) {
      expect(html).toContain(`data-resource-kind="${kind}"`);
      expect(html).toContain(`/resources?resource_kind=${kind}`);
    }
    expect((html.match(/min-h-20/g) || []).length).toBe(4);
    expect(html).toContain('aria-current="page"');
  });
});

import { mergeResourceQuery } from './query';
import { RESOURCE_KINDS as resourceKinds } from '../display-labels';

test('resource filter updates preserve existing URL query compatibility', () => {
  const result = new URLSearchParams(mergeResourceQuery(
    'category_id=4&sort=download_count&tag=campaign&supported_version=V8&compatibility=Linux&resource_kind=map&planet=Serpulo',
    { resource_kind: 'schematic', tag: null },
  ));
  for (const key of ['category_id', 'sort', 'supported_version', 'compatibility', 'planet']) expect(result.has(key)).toBe(true);
  expect(result.get('resource_kind')).toBe('schematic');
  expect(result.has('tag')).toBe(false);
});

test('canonical resource kinds are the single primary taxonomy and legacy topic filters remain compatible', () => {
  expect(resourceKinds.map(({ value }) => value)).toEqual([
    'mod', 'map', 'schematic', 'save', 'game_version', 'server_plugin', 'development_tool', 'texture_ui', 'pack', 'other',
  ]);
  const query = new URLSearchParams(mergeResourceQuery('category_id=12', { resource_kind: 'map' }));
  expect(query.get('category_id')).toBe('12');
  expect(query.get('resource_kind')).toBe('map');
});

test('removing one resource filter preserves all other shareable URL state', () => {
  const result = new URLSearchParams(mergeResourceQuery(
    'category_id=8&search=reactor&sort=download_count&tag=campaign&supported_version=V8&compatibility=Linux&resource_kind=map&planet=Serpulo',
    { planet: null },
  ));
  expect(result.has('planet')).toBe(false);
  for (const key of ['category_id', 'search', 'sort', 'tag', 'supported_version', 'compatibility', 'resource_kind']) {
    expect(result.has(key)).toBe(true);
  }
});

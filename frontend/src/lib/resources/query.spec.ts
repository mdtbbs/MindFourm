import {
  MAX_MAP_DIMENSION,
  mapDimensionInvalid,
  mergeResourceQuery,
  normalizeResourceFilterParams,
  parseMapDimension,
  parseMapFilters,
} from './query';
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

test('map and blueprint conditions survive a map/schematic switch together', () => {
  const shared = 'resource_kind=map&planet=serpulo&block=router&width=128&height=128&category_id=3';
  const schematic = new URLSearchParams(mergeResourceQuery(shared, { resource_kind: 'schematic' }));
  expect(schematic.get('resource_kind')).toBe('schematic');
  expect(schematic.get('planet')).toBe('serpulo');
  expect(schematic.get('block')).toBe('router');
  expect(schematic.get('width')).toBe('128');
  expect(schematic.get('height')).toBe('128');
  expect(schematic.get('category_id')).toBe('3');

  const backToMap = new URLSearchParams(mergeResourceQuery(schematic.toString(), { resource_kind: 'map' }));
  expect(backToMap.get('block')).toBe('router');
});

test('switching to a non-map kind clears all four conditions instead of hiding them', () => {
  for (const kind of ['mod', 'pack', 'save', 'other', '']) {
    const query = new URLSearchParams(mergeResourceQuery(
      'resource_kind=map&planet=serpulo&block=router&width=128&height=128&tag=campaign',
      { resource_kind: kind || null },
    ));
    for (const key of ['planet', 'block', 'width', 'height']) expect(query.has(key)).toBe(false);
    expect(query.get('tag')).toBe('campaign');
    expect(query.get('resource_kind')).toBe(kind || null);
  }
});

test('map conditions are inert without an explicit map or schematic kind', () => {
  const query = new URLSearchParams(mergeResourceQuery('planet=serpulo&block=router&width=128', {}));
  expect(query.toString()).toBe('');
});

test('dimensions are validated against the backend 1..4096 integer range', () => {
  expect(parseMapDimension('128')).toBe(128);
  expect(parseMapDimension(' 64 ')).toBe(64);
  for (const invalid of ['', ' ', '0', '-1', '1.5', 'abc', 'NaN', 'null', String(MAX_MAP_DIMENSION + 1), '1e3']) {
    expect(parseMapDimension(invalid)).toBeNull();
  }
  expect(mapDimensionInvalid('0')).toBe(true);
  expect(mapDimensionInvalid('')).toBe(false);
  expect(mapDimensionInvalid(null)).toBe(false);
  expect(mapDimensionInvalid('128')).toBe(false);
});

test('invalid dimensions never reach the query while valid siblings stay', () => {
  const query = new URLSearchParams(mergeResourceQuery(
    'resource_kind=map&planet=serpulo&width=0&height=4097',
    { block: 'router' },
  ));
  expect(query.get('block')).toBe('router');
  expect(query.get('planet')).toBe('serpulo');
  expect(query.has('width')).toBe(false);
  expect(query.has('height')).toBe(false);

  const repaired = new URLSearchParams(mergeResourceQuery(query.toString(), { width: '256' }));
  expect(repaired.get('width')).toBe('256');
});

test('parseMapFilters gates on kind and trims text conditions', () => {
  expect(parseMapFilters('mod', { planet: 'serpulo', width: '128' })).toEqual({});
  expect(parseMapFilters(undefined, { planet: 'serpulo' })).toEqual({});
  expect(parseMapFilters('map', { planet: ' serpulo ', block: ' ', width: '128', height: 'abc' }))
    .toEqual({ planet: 'serpulo', width: 128 });
  expect(parseMapFilters('schematic', { block: 'router', height: '64' })).toEqual({ block: 'router', height: 64 });
});


test('SSR canonicalization keeps map conditions and drops the rest from a hand-edited URL', () => {
  const kept = normalizeResourceFilterParams(new URLSearchParams(
    'resource_kind=map&planet=serpulo&block=router&width=128&height=128&category_id=3',
  ));
  expect(kept.get('planet')).toBe('serpulo');
  expect(kept.get('block')).toBe('router');
  expect(kept.get('width')).toBe('128');
  expect(kept.get('height')).toBe('128');
  expect(kept.get('category_id')).toBe('3');
  // A URL that is already canonical must not be redirected again.
  expect(kept.toString()).toBe('resource_kind=map&planet=serpulo&block=router&width=128&height=128&category_id=3');

  const schematic = normalizeResourceFilterParams(new URLSearchParams('resource_kind=schematic&planet=erekir&width=64'));
  expect(schematic.get('planet')).toBe('erekir');
  expect(schematic.get('width')).toBe('64');
});

test('SSR canonicalization removes hidden and invalid map conditions exactly once', () => {
  const other = normalizeResourceFilterParams(new URLSearchParams(
    'resource_kind=pack&planet=serpulo&block=router&width=128&height=128',
  ));
  expect(other.toString()).toBe('resource_kind=pack');

  const noKind = normalizeResourceFilterParams(new URLSearchParams('planet=serpulo&width=128'));
  expect(noKind.toString()).toBe('');

  const invalid = normalizeResourceFilterParams(new URLSearchParams('resource_kind=map&width=0&height=9999&block=router'));
  expect(invalid.get('block')).toBe('router');
  expect(invalid.has('width')).toBe(false);
  expect(invalid.has('height')).toBe(false);
});

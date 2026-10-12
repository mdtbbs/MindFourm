import {
  BLOCK_FILTER_KINDS,
  MAX_MAP_DIMENSION,
  mapDimensionInvalid,
  mergeResourceQuery,
  normalizeResourceFilterParams,
  parseMapDimension,
  parseMapFilters,
} from './query';
import { RESOURCE_KINDS as resourceKinds } from '../display-labels';

/**
 * Renderer metadata evidence: the backend matches `block` against
 * `renderer_metadata_json.block_types[*].name`, the schematic renderer emits
 * that field, and the map renderer does not. A map URL carrying `block` is
 * therefore unanswerable and must not survive canonicalisation.
 */
test('only the blueprint kind owns the block condition', () => {
  expect(BLOCK_FILTER_KINDS).toEqual(['schematic']);
  expect(parseMapFilters('map', { block: 'router', planet: 'serpulo', width: '128', height: '128' }))
    .toEqual({ planet: 'serpulo', width: 128, height: 128 });
  expect(parseMapFilters('schematic', { block: 'router', planet: 'serpulo', width: '128', height: '128' }))
    .toEqual({ block: 'router', planet: 'serpulo', width: 128, height: 128 });
  expect(parseMapFilters('mod', { block: 'router' })).toEqual({});
  expect(parseMapFilters(undefined, { block: 'router' })).toEqual({});
});

test('a direct map link drops block once and keeps the shared conditions', () => {
  const requested = new URLSearchParams('resource_kind=map&planet=serpulo&block=router&width=128&height=128&category_id=3');
  const canonical = normalizeResourceFilterParams(requested);
  expect(canonical.get('block')).toBeNull();
  expect(canonical.get('planet')).toBe('serpulo');
  expect(canonical.get('width')).toBe('128');
  expect(canonical.get('height')).toBe('128');
  expect(canonical.get('category_id')).toBe('3');
  // Canonicalising the result again is a no-op, so SSR cannot redirect in a loop.
  expect(normalizeResourceFilterParams(canonical).toString()).toBe(canonical.toString());

  const stillBlueprint = normalizeResourceFilterParams(
    new URLSearchParams('resource_kind=schematic&planet=erekir&block=router&width=64&height=64'),
  );
  expect(stillBlueprint.get('block')).toBe('router');
  expect(stillBlueprint.get('planet')).toBe('erekir');
  expect(stillBlueprint.toString()).toBe('resource_kind=schematic&planet=erekir&block=router&width=64&height=64');
});

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

test('planet and dimensions survive a map/schematic switch, block only survives into a blueprint', () => {
  // Canonical map URL (no block) switching to a blueprint.
  const schematic = new URLSearchParams(mergeResourceQuery(
    'resource_kind=map&planet=serpulo&width=128&height=128&category_id=3',
    { resource_kind: 'schematic' },
  ));
  expect(schematic.get('resource_kind')).toBe('schematic');
  expect(schematic.get('planet')).toBe('serpulo');
  expect(schematic.get('width')).toBe('128');
  expect(schematic.get('height')).toBe('128');
  expect(schematic.get('category_id')).toBe('3');
  expect(schematic.has('block')).toBe(false);

  // Blueprint switching back to a map: block goes with the kind it belongs to.
  const backToMap = new URLSearchParams(mergeResourceQuery(
    'resource_kind=schematic&planet=erekir&block=router&width=64&height=64',
    { resource_kind: 'map' },
  ));
  expect(backToMap.get('resource_kind')).toBe('map');
  expect(backToMap.get('planet')).toBe('erekir');
  expect(backToMap.get('width')).toBe('64');
  expect(backToMap.get('height')).toBe('64');
  expect(backToMap.has('block')).toBe(false);
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
    'resource_kind=schematic&planet=serpulo&width=0&height=4097',
    { block: 'router' },
  ));
  expect(query.get('block')).toBe('router');
  expect(query.get('planet')).toBe('serpulo');
  expect(query.has('width')).toBe(false);
  expect(query.has('height')).toBe(false);

  const repaired = new URLSearchParams(mergeResourceQuery(query.toString(), { width: '256' }));
  expect(repaired.get('width')).toBe('256');

  // The same edit on a map never resurrects block.
  const map = new URLSearchParams(mergeResourceQuery('resource_kind=map&planet=serpulo', { width: '0' }));
  expect(map.get('planet')).toBe('serpulo');
  expect(map.has('block')).toBe(false);
  expect(map.has('width')).toBe(false);
});

test('switching into a map from another kind clears a leftover block condition', () => {
  const fromBlueprint = new URLSearchParams(mergeResourceQuery(
    'resource_kind=schematic&block=router&planet=serpulo',
    { resource_kind: 'map' },
  ));
  expect(fromBlueprint.has('block')).toBe(false);
  expect(fromBlueprint.get('planet')).toBe('serpulo');

  for (const kind of ['mod', 'pack', '']) {
    const query = new URLSearchParams(mergeResourceQuery(
      'resource_kind=schematic&block=router&planet=serpulo&width=64',
      { resource_kind: kind || null },
    ));
    for (const key of ['planet', 'block', 'width', 'height']) expect(query.has(key)).toBe(false);
  }
});

test('parseMapFilters gates on kind and trims text conditions', () => {
  expect(parseMapFilters('mod', { planet: 'serpulo', width: '128' })).toEqual({});
  expect(parseMapFilters(undefined, { planet: 'serpulo' })).toEqual({});
  expect(parseMapFilters('map', { planet: ' serpulo ', block: ' ', width: '128', height: 'abc' }))
    .toEqual({ planet: 'serpulo', width: 128 });
  expect(parseMapFilters('schematic', { block: 'router', height: '64' })).toEqual({ block: 'router', height: 64 });
});


test('SSR canonicalization keeps blueprint conditions and drops the rest from a hand-edited URL', () => {
  const kept = normalizeResourceFilterParams(new URLSearchParams(
    'resource_kind=schematic&planet=erekir&block=router&width=64&height=64&category_id=3',
  ));
  expect(kept.get('planet')).toBe('erekir');
  expect(kept.get('block')).toBe('router');
  expect(kept.get('width')).toBe('64');
  expect(kept.get('height')).toBe('64');
  expect(kept.get('category_id')).toBe('3');
  // A URL that is already canonical must not be redirected again.
  expect(kept.toString()).toBe('resource_kind=schematic&planet=erekir&block=router&width=64&height=64&category_id=3');
});

test('SSR canonicalization strips block from a map URL exactly once', () => {
  const requested = new URLSearchParams('resource_kind=map&planet=serpulo&block=router&width=128&height=128');
  const kept = normalizeResourceFilterParams(requested);
  expect(kept.toString()).toBe('resource_kind=map&planet=serpulo&width=128&height=128');
  expect(normalizeResourceFilterParams(kept).toString()).toBe(kept.toString());
});

test('SSR canonicalization removes hidden and invalid map conditions exactly once', () => {
  const other = normalizeResourceFilterParams(new URLSearchParams(
    'resource_kind=pack&planet=serpulo&block=router&width=128&height=128',
  ));
  expect(other.toString()).toBe('resource_kind=pack');

  const noKind = normalizeResourceFilterParams(new URLSearchParams('planet=serpulo&width=128'));
  expect(noKind.toString()).toBe('');

  const invalid = normalizeResourceFilterParams(new URLSearchParams('resource_kind=map&width=0&height=9999&block=router'));
  expect(invalid.toString()).toBe('resource_kind=map');
  expect(invalid.has('block')).toBe(false);
  expect(invalid.has('width')).toBe(false);
  expect(invalid.has('height')).toBe(false);
});

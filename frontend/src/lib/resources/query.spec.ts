import {
  MAX_BLOCK_LENGTH,
  MAX_MAP_DIMENSION,
  MAX_MOD_FILTER_LENGTH,
  blockInvalid,
  isBlockFilterKind,
  isMapFilterKind,
  mapDimensionInvalid,
  mapFilterKeys,
  mapTextFilterKeys,
  mergeResourceQuery,
  modFilterKeys,
  modListValue,
  parseModList,
  normalizeResourceFilterParams,
  parseMapDimension,
  parseMapFilters,
  resourceListQuery,
} from './query';
import { RESOURCE_KINDS as resourceKinds } from '../display-labels';

/**
 * Field provenance, not symmetry:
 * - `block` matches `renderer_metadata_json.block_types[*].name`. Only the
 *   schematic renderer emits `block_types`, so only a blueprint can answer it.
 * - `planet` comes from map rules. No schematic-side source exists: the
 *   analyzer projects no planet, `schematic_version_metadata` has no planet
 *   column, and the official `.msch` fixture carries no planet tag.
 */
test('each kind exposes exactly the conditions its renderer metadata can answer', () => {
  expect(mapFilterKeys('map')).toEqual(['planet', 'width', 'height']);
  expect(mapFilterKeys('schematic')).toEqual(['block', 'width', 'height']);
  for (const kind of ['mod', 'pack', 'save', 'other', '', undefined, null]) expect(mapFilterKeys(kind)).toEqual([]);
  expect(isMapFilterKind('map')).toBe(true);
  expect(isMapFilterKind('schematic')).toBe(true);
  expect(isMapFilterKind('mod')).toBe(false);
  expect(isBlockFilterKind('schematic')).toBe(true);
  expect(isBlockFilterKind('map')).toBe(false);
});

test('a parse drops every condition the selected kind cannot answer', () => {
  expect(parseMapFilters('map', { block: 'router', planet: 'serpulo', width: '128', height: '128' }))
    .toEqual({ planet: 'serpulo', width: 128, height: 128 });
  expect(parseMapFilters('schematic', { block: 'router', planet: 'serpulo', width: '128', height: '128' }))
    .toEqual({ block: 'router', width: 128, height: 128 });
  expect(parseMapFilters('mod', { block: 'router' })).toEqual({});
  expect(parseMapFilters(undefined, { block: 'router' })).toEqual({});
});

test('a direct link drops the conditions its kind cannot answer, exactly once', () => {
  const map = normalizeResourceFilterParams(
    new URLSearchParams('resource_kind=map&planet=serpulo&block=router&width=128&height=128&category_id=3'),
  );
  expect(map.get('block')).toBeNull();
  expect(map.get('planet')).toBe('serpulo');
  expect(map.get('width')).toBe('128');
  expect(map.get('height')).toBe('128');
  expect(map.get('category_id')).toBe('3');
  // Canonicalising the result again is a no-op, so SSR cannot redirect in a loop.
  expect(normalizeResourceFilterParams(map).toString()).toBe(map.toString());

  const schematic = normalizeResourceFilterParams(
    new URLSearchParams('resource_kind=schematic&planet=erekir&block=router&width=64&height=64'),
  );
  expect(schematic.get('planet')).toBeNull();
  expect(schematic.get('block')).toBe('router');
  expect(schematic.get('width')).toBe('64');
  expect(schematic.get('height')).toBe('64');
  expect(schematic.toString()).toBe('resource_kind=schematic&block=router&width=64&height=64');
});

test('canonicalization never touches an unrelated condition', () => {
  const requested = new URLSearchParams(
    'resource_kind=schematic&planet=erekir&block=router&width=64&height=64&tag=campaign&category_id=3&search=reactor&sort=download_count&supported_version=V8&compatibility=Linux',
  );
  const kept = normalizeResourceFilterParams(requested);
  expect(kept.has('planet')).toBe(false);
  for (const key of ['tag', 'category_id', 'search', 'sort', 'supported_version', 'compatibility', 'resource_kind', 'block', 'width', 'height']) {
    expect(kept.has(key)).toBe(true);
  }
  expect(kept.get('tag')).toBe('campaign');
  expect(kept.get('sort')).toBe('download_count');
  expect(normalizeResourceFilterParams(kept).toString()).toBe(kept.toString());
});

test('resource filter updates preserve every unrelated URL condition', () => {
  const result = new URLSearchParams(mergeResourceQuery(
    'category_id=4&sort=download_count&tag=campaign&supported_version=V8&compatibility=Linux&resource_kind=mod',
    { tag: null },
  ));
  for (const key of ['category_id', 'sort', 'supported_version', 'compatibility', 'resource_kind']) expect(result.has(key)).toBe(true);
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

test('a map/blueprint switch keeps only the conditions both kinds can answer', () => {
  // Canonical map URL switching to a blueprint: width/height carry over, the
  // map-only planet goes because a blueprint has no planet source.
  const schematic = new URLSearchParams(mergeResourceQuery(
    'resource_kind=map&planet=serpulo&width=128&height=128&category_id=3',
    { resource_kind: 'schematic' },
  ));
  expect(schematic.get('resource_kind')).toBe('schematic');
  expect(schematic.get('width')).toBe('128');
  expect(schematic.get('height')).toBe('128');
  expect(schematic.get('category_id')).toBe('3');
  expect(schematic.has('planet')).toBe(false);
  expect(schematic.has('block')).toBe(false);

  // Blueprint switching to a map: block goes with the kind it belongs to.
  const backToMap = new URLSearchParams(mergeResourceQuery(
    'resource_kind=schematic&block=router&width=64&height=64&planet=erekir',
    { resource_kind: 'map' },
  ));
  expect(backToMap.get('resource_kind')).toBe('map');
  expect(backToMap.get('planet')).toBe('erekir');
  expect(backToMap.get('width')).toBe('64');
  expect(backToMap.get('height')).toBe('64');
  expect(backToMap.has('block')).toBe(false);
});

test('a kind switch keeps the target kind conditions and never resurrects the other kind ones', () => {
  // blueprint -> map: the map keeps planet (a condition it can answer) and
  // loses block; map -> blueprint: planet does not come back and block appears.
  const toMap = new URLSearchParams(mergeResourceQuery(
    'resource_kind=schematic&planet=serpulo&block=router&width=64&height=64',
    { resource_kind: 'map' },
  ));
  expect(toMap.get('resource_kind')).toBe('map');
  expect(toMap.get('planet')).toBe('serpulo');
  expect(toMap.get('width')).toBe('64');
  expect(toMap.get('height')).toBe('64');
  expect(toMap.has('block')).toBe(false);

  const toBlueprint = new URLSearchParams(mergeResourceQuery(
    'resource_kind=map&planet=serpulo&width=128&height=128',
    { resource_kind: 'schematic' },
  ));
  expect(toBlueprint.get('resource_kind')).toBe('schematic');
  expect(toBlueprint.get('width')).toBe('128');
  expect(toBlueprint.get('height')).toBe('128');
  // planet belongs to map only: switching to a blueprint drops it for good.
  expect(toBlueprint.has('planet')).toBe(false);

  const withBlock = new URLSearchParams(mergeResourceQuery(toBlueprint.toString(), { block: 'router' }));
  expect(withBlock.get('block')).toBe('router');
  expect(withBlock.has('planet')).toBe(false);
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
    'resource_kind=schematic&width=0&height=4097',
    { block: 'router' },
  ));
  expect(query.get('block')).toBe('router');
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

test('switching between kinds clears the conditions the target kind cannot answer', () => {
  const toMap = new URLSearchParams(mergeResourceQuery(
    'resource_kind=schematic&block=router&width=64&planet=serpulo',
    { resource_kind: 'map' },
  ));
  expect(toMap.has('block')).toBe(false);
  expect(toMap.get('planet')).toBe('serpulo');
  expect(toMap.get('width')).toBe('64');

  const toBlueprint = new URLSearchParams(mergeResourceQuery(
    'resource_kind=map&planet=serpulo&width=64',
    { resource_kind: 'schematic' },
  ));
  expect(toBlueprint.has('planet')).toBe(false);
  expect(toBlueprint.get('width')).toBe('64');

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
  expect(parseMapFilters('schematic', { block: ' router ', planet: 'erekir', height: '64' }))
    .toEqual({ block: 'router', height: 64 });
});


test('SSR canonicalization keeps blueprint conditions and drops the rest from a hand-edited URL', () => {
  const kept = normalizeResourceFilterParams(new URLSearchParams(
    'resource_kind=schematic&planet=erekir&block=router&width=64&height=64&category_id=3',
  ));
  expect(kept.get('block')).toBe('router');
  expect(kept.get('width')).toBe('64');
  expect(kept.get('height')).toBe('64');
  expect(kept.get('category_id')).toBe('3');
  expect(kept.has('planet')).toBe(false);
  // A URL that is already canonical must not be redirected again.
  expect(kept.toString()).toBe('resource_kind=schematic&block=router&width=64&height=64&category_id=3');
});

test('a direct link reaches the API with only the conditions its kind can answer', () => {
  // The SSR module is the whole chain: canonicalise the URL, then read the
  // conditions the page hands to the list request and to Load More.
  const apiParams = (href: string) => {
    const canonical = normalizeResourceFilterParams(new URLSearchParams(href));
    const kind = canonical.get('resource_kind');
    return {
      resource_kind: kind,
      ...parseMapFilters(kind, {
        planet: canonical.get('planet'),
        block: canonical.get('block'),
        width: canonical.get('width'),
        height: canonical.get('height'),
      }),
    };
  };

  expect(apiParams('resource_kind=map&planet=serpulo&block=router&width=128&height=128'))
    .toEqual({ resource_kind: 'map', planet: 'serpulo', width: 128, height: 128 });
  expect(apiParams('resource_kind=schematic&planet=erekir&block=router&width=64&height=64'))
    .toEqual({ resource_kind: 'schematic', block: 'router', width: 64, height: 64 });
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

test('only the list API whitelist leaves SSR, so a share link cannot 400 the page', () => {
  // The backend validates the list query with whitelist + forbidNonWhitelisted,
  // so an unknown key is a 400 and the whole page becomes its error state.
  const forwarded = resourceListQuery(new URLSearchParams(
    'utm_source=weibo&resource_kind=map&planet=serpulo&gclid=1&utm_medium=link&width=128',
  ));
  expect(forwarded.get('resource_kind')).toBe('map');
  expect(forwarded.get('planet')).toBe('serpulo');
  expect(forwarded.get('width')).toBe('128');
  for (const key of ['utm_source', 'utm_medium', 'gclid']) expect(forwarded.has(key)).toBe(false);

  // A campaign tag alone forwards nothing at all.
  expect(resourceListQuery(new URLSearchParams('utm_source=weibo')).toString()).toBe('');

  // Every real list condition still survives the copy.
  const full = resourceListQuery(new URLSearchParams(
    'category_id=3&search=reactor&sort=download_count&tag=campaign&supported_version=V8&compatibility=Linux&resource_kind=schematic&block=router&width=64&height=64',
  ));
  for (const key of ['category_id', 'search', 'sort', 'tag', 'supported_version', 'compatibility', 'resource_kind', 'block', 'width', 'height']) {
    expect(full.has(key)).toBe(true);
  }
});

test('an over-long block name never reaches the query', () => {
  const tooLong = 'b'.repeat(MAX_BLOCK_LENGTH + 1);
  const exact = 'b'.repeat(MAX_BLOCK_LENGTH);
  expect(blockInvalid(tooLong)).toBe(true);
  expect(blockInvalid(exact)).toBe(false);
  expect(blockInvalid('')).toBe(false);

  // Never truncated: the backend would 400 on the full value, so it is dropped.
  const kept = parseMapFilters('schematic', { block: tooLong, width: '64' });
  expect(kept.block).toBeUndefined();
  expect(kept.width).toBe(64);
  expect(parseMapFilters('schematic', { block: exact }).block).toBe(exact);
  expect(normalizeResourceFilterParams(new URLSearchParams(`resource_kind=schematic&block=${tooLong}`)).get('block')).toBeNull();
});

test('the submit path reads the same key set as the render path', () => {
  // map: planet is a select and is not a text key; block is not committed at all.
  expect(mapTextFilterKeys('map')).toEqual(['width', 'height']);
  expect(mapTextFilterKeys('schematic')).toEqual(['block', 'width', 'height']);
  for (const kind of ['mod', 'pack', '', undefined, null]) expect(mapTextFilterKeys(kind)).toEqual([]);
});

/**
 * Issue #70: version-level Mod dependency conditions in the URL.
 *
 * The contract the UI and SSR share: only a kind whose versions carry
 * dependency evidence may hold the keys, an empty token list is not a
 * condition, and the value that leaves the client is the same shape the
 * backend's `QueryResourcesDto` accepts (comma-separated, length-limited).
 */
test('only map and blueprint can hold a Mod condition', () => {
  expect(modFilterKeys('map')).toEqual(['required_mods', 'excluded_mods']);
  expect(modFilterKeys('schematic')).toEqual(['required_mods', 'excluded_mods']);
  for (const kind of ['mod', 'pack', 'save', 'other', '', undefined, null]) expect(modFilterKeys(kind)).toEqual([]);
});

test('a Mod list is parsed like the backend reads it, so both sides agree byte for byte', () => {
  expect(parseModList(' alpha.mod , beta.mod ')).toEqual(['alpha.mod', 'beta.mod']);
  expect(parseModList('alpha.mod,ALPHA.MOD')).toEqual(['alpha.mod']);
  expect(parseModList('alpha.mod,, ,')).toEqual(['alpha.mod']);
  expect(parseModList('')).toEqual([]);
  expect(parseModList(undefined)).toEqual([]);

  expect(modListValue(['alpha.mod', 'beta.mod'])).toBe('alpha.mod,beta.mod');
  expect(modListValue([' alpha.mod ', ''])).toBe('alpha.mod');
  // No conditions means no key, never an empty value in the URL.
  expect(modListValue([])).toBeNull();
  expect(modListValue(['', '  '])).toBeNull();
});

test('a Mod list past the backend limit is refused rather than sent to a 400', () => {
  const exact = 'a'.repeat(MAX_MOD_FILTER_LENGTH);
  expect(modListValue([exact])).toBe(exact);
  const tooLong = 'a'.repeat(MAX_MOD_FILTER_LENGTH + 1);
  expect(modListValue([tooLong])).toBeNull();
  // Two tokens that only together overflow are refused as well, not truncated.
  expect(modListValue([exact, 'b'])).toBeNull();
});

test('SSR canonicalisation keeps Mod conditions only for the kind that answers them', () => {
  const map = normalizeResourceFilterParams(new URLSearchParams(
    'resource_kind=map&required_mods=alpha.mod,beta.mod&excluded_mods=rival.mod',
  ));
  expect(map.get('required_mods')).toBe('alpha.mod,beta.mod');
  expect(map.get('excluded_mods')).toBe('rival.mod');
  // Idempotent: canonicalising the canonical form cannot redirect in a loop.
  expect(normalizeResourceFilterParams(map).toString()).toBe(map.toString());

  const schematic = normalizeResourceFilterParams(new URLSearchParams(
    'resource_kind=schematic&required_mods=alpha.mod',
  ));
  expect(schematic.get('required_mods')).toBe('alpha.mod');

  // A hidden condition is removed, not forwarded as a dead filter.
  for (const query of [
    'resource_kind=mod&required_mods=alpha.mod',
    'resource_kind=pack&excluded_mods=rival.mod',
    'required_mods=alpha.mod',
  ]) {
    const normalized = normalizeResourceFilterParams(new URLSearchParams(query));
    expect(normalized.has('required_mods')).toBe(false);
    expect(normalized.has('excluded_mods')).toBe(false);
  }

  // Whitespace and duplicates are a URL-normalisation concern, like the map ones.
  const messy = normalizeResourceFilterParams(new URLSearchParams(
    'resource_kind=map&required_mods=%20alpha.mod%20,%20alpha.mod%20',
  ));
  expect(messy.get('required_mods')).toBe('alpha.mod');

  const overLong = normalizeResourceFilterParams(new URLSearchParams(
    `resource_kind=map&required_mods=${'a'.repeat(MAX_MOD_FILTER_LENGTH + 1)}`,
  ));
  expect(overLong.has('required_mods')).toBe(false);
});

test('the Mod keys are part of the list API whitelist', () => {
  const forwarded = resourceListQuery(new URLSearchParams(
    'resource_kind=map&required_mods=alpha.mod&excluded_mods=rival.mod&utm_source=weibo',
  ));
  expect(forwarded.get('required_mods')).toBe('alpha.mod');
  expect(forwarded.get('excluded_mods')).toBe('rival.mod');
  expect(forwarded.has('utm_source')).toBe(false);
});

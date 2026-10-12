/**
 * Structured map/blueprint filters. The backend `QueryResourcesDto` owns the
 * values (`planet` string, `block` string, `width`/`height` integers 1..4096);
 * this module owns the two rules the UI and SSR share, so a URL can never carry
 * a condition the filter UI cannot show or remove.
 *
 * `planet`/`width`/`height` exist for maps and blueprints. `block` exists for
 * blueprints only: the backend matches it against
 * `renderer_metadata_json.block_types[*].name`, and the map renderer emits no
 * `block_types`, so a map URL carrying `block` can only ever return empty
 * results. Maps therefore drop it instead of offering a control that cannot hit.
 */
export const MAP_FILTER_KEYS = ['planet', 'block', 'width', 'height'] as const;
/** Kinds that own `planet`/`width`/`height`. */
export const MAP_FILTER_KINDS = ['map', 'schematic'] as const;
/** Kinds that additionally own `block`. */
export const BLOCK_FILTER_KINDS = ['schematic'] as const;
export const MIN_MAP_DIMENSION = 1;
export const MAX_MAP_DIMENSION = 4096;

export type MapFilterValues = {
  planet?: string;
  block?: string;
  width?: number;
  height?: number;
};

function isKindIn(kinds: readonly string[], kind?: string | null): boolean {
  return Boolean(kind) && kinds.includes(kind as string);
}

export function isMapFilterKind(kind?: string | null): boolean {
  return isKindIn(MAP_FILTER_KINDS, kind);
}

export function isBlockFilterKind(kind?: string | null): boolean {
  return isKindIn(BLOCK_FILTER_KINDS, kind);
}

/** Digits only: an empty, signed, fractional or out-of-range value is not a query. */
export function parseMapDimension(value?: string | null): number | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < MIN_MAP_DIMENSION || parsed > MAX_MAP_DIMENSION) return null;
  return parsed;
}

export function mapDimensionInvalid(value?: string | null): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '' && parseMapDimension(value) === null;
}

export function parseMapFilters(
  kind: string | null | undefined,
  values: { planet?: string | null; block?: string | null; width?: string | null; height?: string | null },
): MapFilterValues {
  if (!isMapFilterKind(kind)) return {};
  const result: MapFilterValues = {};
  const planet = values.planet?.trim();
  if (planet) result.planet = planet;
  // `block` is blueprint-only: keeping it for a map would send a condition the
  // renderer metadata can never satisfy.
  const block = isBlockFilterKind(kind) ? values.block?.trim() : '';
  if (block) result.block = block;
  const width = parseMapDimension(values.width);
  if (width !== null) result.width = width;
  const height = parseMapDimension(values.height);
  if (height !== null) result.height = height;
  return result;
}

/** Drops hidden and invalid map conditions from an existing query. */
export function normalizeResourceFilterParams(input: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(input);
  const kept = parseMapFilters(params.get('resource_kind'), {
    planet: params.get('planet'),
    block: params.get('block'),
    width: params.get('width'),
    height: params.get('height'),
  });
  for (const key of MAP_FILTER_KEYS) {
    const value = kept[key];
    if (value === undefined) params.delete(key);
    else params.set(key, String(value));
  }
  return params;
}

export function mergeResourceQuery(search: string, updates: Record<string, string | null>): string {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(updates)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return normalizeResourceFilterParams(params).toString();
}

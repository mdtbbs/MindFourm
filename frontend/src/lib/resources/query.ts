/**
 * Structured map/blueprint filters. The backend `QueryResourcesDto` owns the
 * values (`planet` string, `block` string, `width`/`height` integers 1..4096);
 * this module owns the single rule the UI and SSR share, so a URL can never
 * carry a condition the filter UI cannot show, remove, or have answered.
 *
 * Which kind can answer which condition is evidence, not symmetry:
 * - `map`: the renderer emits `planet` (from map rules) plus `width`/`height`.
 * - `schematic`: the renderer emits `block_types[*].name` — the only field the
 *   backend `block` filter matches — plus `width`/`height`. It has no persisted
 *   `planet`: `schematic-analyzer` projects no planet, `schematic_version_metadata`
 *   has no planet column, and the checked-in official `.msch` fixture carries no
 *   planet tag. A blueprint-side planet control would filter on a value that has
 *   no source, so blueprints do not expose it.
 */
export const MAP_FILTER_KEYS = ['planet', 'block', 'width', 'height'] as const;
export type MapFilterKey = (typeof MAP_FILTER_KEYS)[number];

/** The conditions each resource kind can actually answer. */
const KIND_FILTER_KEYS: Record<string, readonly MapFilterKey[]> = {
  map: ['planet', 'width', 'height'],
  schematic: ['block', 'width', 'height'],
};

/**
 * The subset of MAP_FILTER_KEYS a kind can query, empty for every other kind:
 * a hidden condition is removed from the URL rather than merely ignored.
 */
export function mapFilterKeys(kind?: string | null): readonly MapFilterKey[] {
  return (kind && KIND_FILTER_KEYS[kind]) || [];
}

export const MIN_MAP_DIMENSION = 1;
export const MAX_MAP_DIMENSION = 4096;

export type MapFilterValues = {
  planet?: string;
  block?: string;
  width?: number;
  height?: number;
};

/** True while the list is narrowed to a kind that exposes any map condition. */
export function isMapFilterKind(kind?: string | null): boolean {
  return mapFilterKeys(kind).length > 0;
}

/** True only for the kind whose renderer metadata answers the `block` filter. */
export function isBlockFilterKind(kind?: string | null): boolean {
  return mapFilterKeys(kind).includes('block');
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
  const allowed = mapFilterKeys(kind);
  if (!allowed.length) return {};
  const result: MapFilterValues = {};
  // Only the conditions this kind can answer survive, so a hand-edited or stale
  // URL parameter is dropped here instead of being sent to the API.
  if (allowed.includes('planet')) {
    const planet = values.planet?.trim();
    if (planet) result.planet = planet;
  }
  if (allowed.includes('block')) {
    const block = values.block?.trim();
    if (block) result.block = block;
  }
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

/**
 * V1 visual-diff and schematic-logic API client.
 *
 * The endpoints are public reads: a Map or Schematic version pair is compared
 * server-side, and the result is either a structured `diff` payload or a
 * status explaining why no structured comparison exists. Responses use the
 * standard V1 envelope (`{ data, meta }`), so every JSON call goes through
 * `fetchV1`; the PNG overlay is the only binary response.
 *
 * All identifiers and filter values are encoded here. Callers pass raw user
 * input and never build a query string themselves.
 */

import { fetchV1, requestV1Blob, type FetchV1Options } from './transport';

export type VisualDiffKind = 'schematic' | 'map';

export type VisualDiffStatus =
  | 'completed'
  | 'metadata_only'
  | 'computing'
  | 'unavailable'
  | 'disabled'
  | 'failed';

export type VisualDiffResponse = {
  from_version_public_id: string | null;
  to_version_public_id: string | null;
  status: VisualDiffStatus;
  parser_version: string | null;
  diff: Record<string, unknown> | null;
  retry_after_ms?: number;
};

export type VisualDiffPair = { before?: number | null; after?: number | null; delta?: number | null };

export type VisualDiffBlockRef = {
  x?: number | null;
  y?: number | null;
  block?: string | null;
  rotation?: number | null;
  config_type?: string | null;
};

export type VisualDiffBlockConfig = {
  rotation?: number | null;
  config_type?: string | null;
  config_sha256?: string | null;
  config_summary?: unknown;
};

export type VisualDiffModifiedBlock = {
  x?: number | null;
  y?: number | null;
  block?: string | null;
  before?: VisualDiffBlockConfig | null;
  after?: VisualDiffBlockConfig | null;
};

export type SchematicMaterialDelta = {
  item?: string | null;
  before?: number | null;
  after?: number | null;
  delta?: number | null;
};

export type SchematicPowerDelta = {
  production?: VisualDiffPair;
  consumption?: VisualDiffPair;
  net?: VisualDiffPair;
  estimated?: boolean;
};

export type MlogLineType = ' ' | '+' | '-';

export type MlogLine = {
  type?: MlogLineType | string | null;
  text?: string | null;
  before_line?: number | null;
  after_line?: number | null;
};

export type MlogHunk = {
  header?: string | null;
  lines?: MlogLine[];
};

export type MlogLogicPosition = {
  x?: number | null;
  y?: number | null;
  processor_type?: string | null;
};

export type MlogNamedPosition = {
  name?: string | null;
  x?: number | null;
  y?: number | null;
};

export type MlogLogicDiff = {
  key?: string | number | null;
  status?: 'added' | 'removed' | 'modified' | string | null;
  before?: MlogLogicPosition | null;
  after?: MlogLogicPosition | null;
  hunks?: MlogHunk[];
  links?: {
    added?: MlogNamedPosition[];
    removed?: MlogNamedPosition[];
  } | null;
  truncated?: boolean;
};

export type SchematicVisualDiffData = {
  schema_version?: number;
  mode?: string;
  kind?: string;
  offset?: { x?: number | null; y?: number | null };
  blocks?: {
    added?: VisualDiffBlockRef[];
    removed?: VisualDiffBlockRef[];
    modified?: VisualDiffModifiedBlock[];
    truncated?: boolean;
  };
  materials_delta?: SchematicMaterialDelta[];
  power_delta?: SchematicPowerDelta | null;
  logic_diffs?: MlogLogicDiff[];
  logic_truncated?: boolean;
  metadata?: {
    width?: VisualDiffPair;
    height?: VisualDiffPair;
    block_count?: VisualDiffPair;
  } | null;
  estimated?: boolean;
};

export type MapRuleEntry = { key?: string | null; value?: unknown };
export type MapRuleChange = { key?: string | null; before?: unknown; after?: unknown };

export type MapRulesDiff = {
  added?: MapRuleEntry[];
  removed?: MapRuleEntry[];
  changed?: MapRuleChange[];
  banned_blocks?: { added?: string[]; removed?: string[] } | null;
  banned_units?: { added?: string[]; removed?: string[] } | null;
  loadout?: { added?: unknown[]; removed?: unknown[] } | null;
  unknown_rules_changed?: boolean;
};

export type MapWaveCurvePoint = {
  wave_start?: number | null;
  wave_end?: number | null;
  estimated_health?: number | null;
  strength?: number | null;
  boss_count?: number | null;
};

export type MapWavesDiff = {
  groups?: {
    added?: unknown[];
    removed?: unknown[];
    changed?: unknown[];
    truncated?: boolean;
  } | null;
  wave_count?: { before?: number | null; after?: number | null } | null;
  curve?: {
    before?: MapWaveCurvePoint[];
    after?: MapWaveCurvePoint[];
  } | null;
};

export type MapObjectCount = { before?: number | null; after?: number | null };

export type MapObjectsDiff = {
  cores?: Record<string, unknown>;
  spawns?: Record<string, unknown>;
  buildings?: Record<string, unknown>;
  truncated?: boolean;
  counts?: {
    cores?: MapObjectCount | null;
    spawns?: MapObjectCount | null;
    buildings?: MapObjectCount | null;
  } | null;
};

export type MapResourceDelta = {
  name?: string | null;
  kind?: string | null;
  before_tiles?: number | null;
  after_tiles?: number | null;
  delta?: number | null;
};

export type MapTerrainChunkSummary = {
  cx?: number | null;
  cy?: number | null;
  floor_changed?: boolean;
  overlay_changed?: boolean;
};

export type MapVisualDiffData = {
  schema_version?: number;
  mode?: string;
  kind?: string;
  rules_diff?: MapRulesDiff | null;
  waves_diff?: MapWavesDiff | null;
  objects_diff?: MapObjectsDiff | null;
  resources_delta?: MapResourceDelta[];
  terrain_chunks_summary?: MapTerrainChunkSummary[];
  chunk_size?: number;
  chunks_truncated?: boolean;
  objects_truncated?: boolean;
  diff_overlay_preview_key?: string | null;
  estimated?: boolean;
};

export type MetadataOnlyVisualDiffData = {
  schema_version?: number;
  mode?: string;
  fallback_reason?: string | null;
  file_delta?: {
    size_from?: number | null;
    size_to?: number | null;
    sha256_changed?: boolean;
  } | null;
  metadata_delta?: {
    version_from?: string | null;
    version_to?: string | null;
    game_version_bounds_changed?: boolean;
  } | null;
  dependencies_delta?: {
    added?: string[];
    removed?: string[];
  } | null;
};

export type MapDiffChunkStatus = 'ready' | 'metadata_only' | 'unavailable' | 'computing';

export type MapDiffChunkRun = {
  x?: number | null;
  y?: number | null;
  length?: number | null;
  from?: string | null;
  to?: string | null;
};

export type MapDiffChunkData = {
  cx?: number | null;
  cy?: number | null;
  tileWidth?: number | null;
  tileHeight?: number | null;
  floorChanged?: boolean;
  overlayChanged?: boolean;
  floorRuns?: MapDiffChunkRun[];
  overlayRuns?: MapDiffChunkRun[];
  truncated?: boolean;
};

export type MapDiffChunkResponse = {
  from_version_public_id: string | null;
  to_version_public_id: string | null;
  cx: number;
  cy: number;
  status: MapDiffChunkStatus;
  chunk: MapDiffChunkData | null;
  retry_after_ms?: number;
};

export type SchematicLogicFinding = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  line: number | null;
};

export type SchematicLogicSnippet = {
  id: number;
  resource_public_id: string;
  resource_url: string;
  title: string;
  version_public_id: string;
  version: string | null;
  author: { id: number; username: string; avatar_url: string | null } | null;
  processor_type: string;
  position: { x: number | null; y: number | null };
  instruction_count: number;
  estimated_cycle_ticks: number | null;
  opcodes: string[];
  referenced_units: string[];
  referenced_blocks: string[];
  has_warnings: boolean;
  findings: SchematicLogicFinding[];
  source_excerpt: string | null;
};

export type SchematicLogicSearchResponse = {
  items: SchematicLogicSnippet[];
  pagination: { next_cursor: string | null; has_more: boolean };
};

const KIND_PATH: Record<VisualDiffKind, string> = { schematic: 'schematics', map: 'maps' };

/** Encode a key/value pair. `null`, `undefined` and empty strings are dropped. */
function queryEntries(entries: Array<[string, string | number | null | undefined]>): string {
  const parts: string[] = [];
  for (const [key, raw] of entries) {
    if (raw === null || raw === undefined) continue;
    const value = typeof raw === 'number' ? String(raw) : raw;
    if (!value) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

function trimmedBounded(value: string | undefined, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function opaqueCursor(value: string | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 1024) : null;
}

function boundedLimit(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return Math.min(50, Math.max(1, Math.trunc(value)));
}

function chunkCoordinate(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1_000_000, Math.trunc(value))) : 0;
}

export type ResourceVisualDiffOptions = {
  toVersionPublicId?: string | null;
  fromVersionPublicId?: string | null;
  signal?: AbortSignal;
};

/**
 * Compare two schematic or map versions.
 *
 * `toVersionPublicId` may be omitted (backend picks the recommended/latest
 * published version); when `fromVersionPublicId` is omitted the backend picks
 * the previous published version. A computing comparison returns HTTP 202,
 * which `fetchV1` still resolves as a successful `computing` payload.
 */
export async function getResourceVisualDiff(
  publicId: string,
  kind: VisualDiffKind,
  options: ResourceVisualDiffOptions = {},
): Promise<VisualDiffResponse> {
  const query = queryEntries([
    ['from_version_public_id', options.fromVersionPublicId ?? null],
    ['to_version_public_id', options.toVersionPublicId ?? null],
  ]);
  return fetchV1<VisualDiffResponse>(
    `/resources/${KIND_PATH[kind]}/${encodeURIComponent(publicId)}/diff${query}`,
    { signal: options.signal },
  );
}

/** Read one 128×128 terrain chunk (RLE runs) of a map comparison. */
export async function getMapDiffChunk(
  publicId: string,
  options: {
    fromVersionPublicId?: string | null;
    toVersionPublicId: string | null;
    cx: number;
    cy: number;
    signal?: AbortSignal;
  },
): Promise<MapDiffChunkResponse> {
  const query = queryEntries([
    ['from_version_public_id', options.fromVersionPublicId ?? null],
    ['to_version_public_id', options.toVersionPublicId ?? null],
    ['cx', chunkCoordinate(options.cx)],
    ['cy', chunkCoordinate(options.cy)],
  ]);
  return fetchV1<MapDiffChunkResponse>(
    `/resources/maps/${encodeURIComponent(publicId)}/diff/chunk${query}`,
    { signal: options.signal },
  );
}

/**
 * Same-origin URL for the diff overlay PNG.
 *
 * The file is referenced directly by `<img src>`; it is not fetched through
 * the JSON transport, so the literal relative path is intentional. The
 * endpoint may answer 404 when no overlay was generated.
 */
export function getMapDiffOverlayUrl(
  publicId: string,
  options: { fromVersionPublicId?: string | null; toVersionPublicId?: string | null } = {},
): string {
  const query = queryEntries([
    ['from_version_public_id', options.fromVersionPublicId ?? null],
    ['to_version_public_id', options.toVersionPublicId ?? null],
  ]);
  return `/api/v1/resources/maps/${encodeURIComponent(publicId)}/diff/overlay${query}`;
}

/** Fetch the overlay PNG bytes (for callers that need to detect 404s or decode it). */
export async function getMapDiffOverlayBlob(
  publicId: string,
  options: { fromVersionPublicId?: string | null; toVersionPublicId?: string | null; signal?: AbortSignal } = {},
): Promise<Blob> {
  const query = queryEntries([
    ['from_version_public_id', options.fromVersionPublicId ?? null],
    ['to_version_public_id', options.toVersionPublicId ?? null],
  ]);
  return requestV1Blob(
    `/resources/maps/${encodeURIComponent(publicId)}/diff/overlay${query}`,
    { method: 'GET', signal: options.signal },
  );
}

export type SchematicLogicSearchOptions = {
  q?: string;
  opcode?: string;
  unit?: string;
  processorType?: string;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
};

/**
 * Search publicly published schematic logic snippets.
 *
 * User-entered filters are trimmed, length-bounded and URL-encoded here so the
 * endpoint never receives a raw concatenated value.
 */
export async function searchSchematicLogic(
  options: SchematicLogicSearchOptions = {},
): Promise<SchematicLogicSearchResponse> {
  const query = queryEntries([
    ['q', trimmedBounded(options.q, 200)],
    ['opcode', trimmedBounded(options.opcode, 50)],
    ['unit', trimmedBounded(options.unit, 50)],
    ['processor_type', trimmedBounded(options.processorType, 64)],
    ['cursor', opaqueCursor(options.cursor)],
    ['limit', boundedLimit(options.limit)],
  ]);
  return fetchV1<SchematicLogicSearchResponse>(
    `/resources/schematics/logic-search${query}`,
    { signal: options.signal },
  );
}

export type SchematicLogicItem = {
  x: number | null;
  y: number | null;
  processor_type: string;
  links: Array<{ name?: string | null; x?: number | null; y?: number | null }>;
  logic_source: string | null;
  logic_source_available: boolean;
  source_truncated?: boolean;
  instruction_count?: number;
  estimated_cycle_ticks?: number | null;
  has_warnings?: boolean;
  audit_findings?: Array<{ code?: string; severity?: string; message?: string; line?: number | null }>;
};

/** Current-version inert mlog processors for the resource card's “查看内置 mlog”. */
export async function getSchematicLogic(
  publicId: string,
  versionPublicId: string,
  options?: FetchV1Options,
): Promise<{ items: SchematicLogicItem[]; pagination: { next_cursor: string | null; has_more: boolean } }> {
  const query = new URLSearchParams({ version_public_id: versionPublicId, limit: '50' });
  const response = await fetchV1<Record<string, unknown>>(
    `/resources/schematics/${encodeURIComponent(publicId)}/logic?${query.toString()}`,
    options,
  );
  const items = Array.isArray(response.items) ? response.items as SchematicLogicItem[] : [];
  const pagination = response.pagination && typeof response.pagination === 'object'
    ? response.pagination as Record<string, unknown> : {};
  return {
    items,
    pagination: {
      next_cursor: typeof pagination.next_cursor === 'string' ? pagination.next_cursor : null,
      has_more: pagination.has_more === true,
    },
  };
}

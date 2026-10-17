/**
 * Bounded projections of the renderer metadata the resource detail page needs:
 * wave summaries and the per-tile deposit distribution. The backend analyzer
 * (`src/modules/resources/analyzers/map-analyzer.ts`) folds the same shapes
 * into the version-scoped tables, so keep the math here aligned with it.
 */

export type MapWaveSummary = {
  wave_start: number;
  wave_end: number | null;
  enemy_count: number | null;
  estimated_health: number | null;
  air_ratio: number | null;
  boss_count: number;
  strength: number | null;
  is_spike: boolean;
};

export type MapResourceSummary = {
  resource_type: string;
  internal_name: string;
  tiles: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Projects renderer wave groups into the bounded summaries both pages display. */
export function normalizeMapWaves(value: unknown): MapWaveSummary[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).flatMap((item): MapWaveSummary[] => {
    const row = record(item);
    if (!row) return [];
    const start = finite(row.wave_start ?? row.begin);
    const end = finite(row.wave_end ?? row.end ?? row.begin);
    if (start === null || end === null || end < start) return [];
    const amount = finite(row.amount ?? row.enemy_count);
    const spacing = Math.max(1, Math.floor(finite(row.spacing) ?? 1));
    const waveCount = end > 1_000_000 ? 1 : Math.floor((end - start) / spacing) + 1;
    const enemyCount = finite(row.enemy_count) ?? (amount === null ? null : amount * waveCount);
    const unitHealth = finite(row.unit_health ?? row.health);
    const shields = Math.max(0, finite(row.shields) ?? 0);
    const health = finite(row.estimated_health) ?? (enemyCount === null || unitHealth === null ? null : enemyCount * (unitHealth + shields));
    const air = finite(row.air_ratio) ?? (typeof row.flying === 'boolean' ? (row.flying ? 1 : 0) : null);
    const bosses = finite(row.boss_count);
    return [{
      wave_start: start,
      wave_end: end > 1_000_000 ? null : end,
      enemy_count: enemyCount,
      estimated_health: health,
      air_ratio: air === null ? null : Math.min(1, Math.max(0, air)),
      boss_count: bosses === null ? (row.boss === true || row.is_boss === true ? enemyCount ?? 1 : 0) : Math.max(0, Math.floor(bosses)),
      strength: finite(row.strength) ?? enemyCount,
      is_spike: row.is_spike === true || row.spike === true,
    }];
  });
}

/** Layer key -> the resource_type the renderer's tile belongs to. */
const TILE_RESOURCE_LAYERS: ReadonlyArray<readonly [string, 'item' | 'ore' | 'liquid']> = [
  ['resources', 'item'],
  ['ores', 'ore'],
  ['liquid', 'liquid'],
];

/**
 * Counts deposit tiles per resource name. The renderer publishes deposits as
 * per-tile layers, so a plain list length would overstate a single deposit.
 */
export function summarizeMapTileResources(tileLayers: unknown, limit = 200): MapResourceSummary[] {
  const layers = record(tileLayers);
  if (!layers) return [];
  const totals = new Map<string, MapResourceSummary>();
  for (const [layerKey, resourceType] of TILE_RESOURCE_LAYERS) {
    const layer = layers[layerKey];
    if (!Array.isArray(layer)) continue;
    for (const raw of layer) {
      const item = record(raw);
      const name = item?.name ?? item?.item ?? item?.resource ?? item?.block;
      if (typeof name !== 'string' || !name) continue;
      const key = `${resourceType}:${name}`;
      const existing = totals.get(key);
      if (existing) existing.tiles += 1;
      else if (totals.size < limit) totals.set(key, { resource_type: resourceType, internal_name: name, tiles: 1 });
    }
  }
  return [...totals.values()].sort((left, right) => left.resource_type.localeCompare(right.resource_type) || left.internal_name.localeCompare(right.internal_name));
}

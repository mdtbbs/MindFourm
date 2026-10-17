import { normalizeMapWaves, summarizeMapTileResources } from './map-analysis';

describe('normalizeMapWaves', () => {
  it('normalizes bounded wave summaries and keeps unavailable estimates null', () => {
    expect(normalizeMapWaves([
      { wave_start: 4, wave_end: 8, enemy_count: 12, estimated_health: null, air_ratio: 1.2, boss_count: 2, strength: 12, is_spike: true },
      { wave_start: 9, wave_end: 8, enemy_count: 1 },
    ])).toEqual([{
      wave_start: 4, wave_end: 8, enemy_count: 12, estimated_health: null,
      air_ratio: 1, boss_count: 2, strength: 12, is_spike: true,
    }]);
  });

  it('derives estimated values from renderer unit metadata as a fallback', () => {
    expect(normalizeMapWaves([{ begin: 4, end: 8, spacing: 2, amount: 3, unit_health: 100, shields: 10, flying: true, boss: true }])).toEqual([{
      wave_start: 4, wave_end: 8, enemy_count: 9, estimated_health: 990,
      air_ratio: 1, boss_count: 9, strength: 9, is_spike: false,
    }]);
  });

  it('keeps open-ended renderer waves open instead of inventing a finite end', () => {
    expect(normalizeMapWaves([{ begin: 5, end: 2_147_483_647, amount: 1 }])[0].wave_end).toBeNull();
    expect(normalizeMapWaves('nope')).toEqual([]);
  });
});

describe('summarizeMapTileResources', () => {
  it('counts deposit tiles per resource name across the renderer layers', () => {
    expect(summarizeMapTileResources({
      resources: [{ x: 1, y: 1, name: 'copper' }, { x: 2, y: 1, name: 'copper' }, { x: 3, y: 1, name: 'lead' }],
      ores: [{ x: 4, y: 4, name: 'thorium' }],
      liquid: [{ x: 5, y: 5, name: 'water' }],
      terrain: [{ x: 0, y: 0, name: 'sand' }],
    })).toEqual([
      { resource_type: 'item', internal_name: 'copper', tiles: 2 },
      { resource_type: 'item', internal_name: 'lead', tiles: 1 },
      { resource_type: 'liquid', internal_name: 'water', tiles: 1 },
      { resource_type: 'ore', internal_name: 'thorium', tiles: 1 },
    ]);
  });

  it('reports nothing when the renderer supplied no deposit layers', () => {
    expect(summarizeMapTileResources(undefined)).toEqual([]);
    expect(summarizeMapTileResources({ terrain: [{ x: 0, y: 0, name: 'sand' }] })).toEqual([]);
    expect(summarizeMapTileResources({ resources: [{ x: 1, y: 1 }] })).toEqual([]);
  });
});

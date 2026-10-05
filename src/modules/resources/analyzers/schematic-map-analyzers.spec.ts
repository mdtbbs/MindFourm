import { analyzeMapMetadata } from './map-analyzer';
import { analyzeSchematicMetadata } from './schematic-analyzer';
import { RENDERER_ANALYZER_LIMITS } from './renderer-metadata.util';

describe('schematic and map metadata analyzers', () => {
  it('normalizes schematic structure and keeps theoretical production findings explicitly estimated', () => {
    const result = analyzeSchematicMetadata({
      width: 12,
      height: 8,
      block_count: 3,
      block_types: [{ name: 'graphite-press', count: 1 }, { name: 'power-node', count: 1 }],
      block_positions: [
        { block: 'graphite-press', x: 3, y: 4, rotation: 1, config: 'private logic payload' },
        { block: 'logic-processor', x: 7, y: 2 },
      ],
      requirements: [{ item: 'copper', amount: 24 }, { item: 'copper', amount: 5 }, { item: 'lead', amount: 12 }],
      mod_dependencies: ['example-mod'],
      compatibility: { minimum_supported_build: 151 },
      structure_hash: 'a'.repeat(64),
      production: {
        mode: 'theoretical',
        complete: true,
        available: true,
        items: {
          inputs: [{ id: 'coal', name: 'Coal', rate: 12 }],
          outputs: [{ id: 'graphite', name: 'Graphite', rate: 6 }],
          internal: [{ id: 'graphite', produced: 6, consumed: 4, net: 2 }],
        },
        liquids: { inputs: [], outputs: [], internal: [] },
        power: { generated: 20, consumed: 30, net: -10 },
        warnings: [{ type: 'terrain-dependent', blockId: 'mechanical-drill', count: 1 }],
      },
    }, { required_mods: ['another-mod'] });

    expect(result.metadata).toMatchObject({ width: 12, height: 8, block_count: 3, min_supported_build: 151 });
    expect(result.blocks).toContainEqual(expect.objectContaining({ internal_name: 'graphite-press', count: 1 }));
    expect(result.blocks.find((item) => item.internal_name === 'logic-processor')?.count).toBe(1);
    expect(result.blocks.find((item) => item.internal_name === 'graphite-press')?.positions_json).toEqual([{ x: 3, y: 4, rotation: 1 }]);
    expect(result.materials).toEqual([{ internal_name: 'copper', amount: 29 }, { internal_name: 'lead', amount: 12 }]);
    expect(result.logic_processors).toEqual([expect.objectContaining({ position_x: 7, position_y: 2, processor_type: 'logic-processor' })]);
    expect(result.analysis).toMatchObject({ complete: true, available: true, estimated: true });
    expect(result.analysis.production_json).toMatchObject({
      mode: 'theoretical', estimated: true,
      items: { inputs: [{ id: 'coal', rate: 12 }], outputs: [{ id: 'graphite', rate: 6 }] },
    });
    expect(result.analysis.bottlenecks_json).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'power-deficit', deficit_per_second: 10, estimated: true }),
      expect.objectContaining({ type: 'external-input', internal_name: 'coal', estimated: true }),
    ]));
    expect(result.analysis.warnings_json).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'terrain-dependent' }),
      expect.objectContaining({ code: 'LOGIC_CONFIG_NOT_ANALYZED', severity: 'info' }),
    ]));
    expect(JSON.stringify(result.logic_processors)).not.toContain('private logic payload');
  });

  it('derives schematic block counts only when renderer block type counts are missing', () => {
    const derived = analyzeSchematicMetadata({ block_positions: [{ block: 'router', x: 0, y: 0 }, { block: 'router', x: 1, y: 0 }] });
    expect(derived.blocks).toEqual([expect.objectContaining({ internal_name: 'router', count: 2 })]);
    expect(derived.analysis.warnings_json).toContainEqual(expect.objectContaining({ code: 'BLOCK_COUNTS_DERIVED' }));

    const authoritative = analyzeSchematicMetadata({
      block_types: [{ name: 'router', count: 7 }],
      block_positions: [{ block: 'router', x: 0, y: 0 }, { block: 'unlisted', x: 1, y: 0 }],
    });
    expect(authoritative.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ internal_name: 'router', count: 7 }),
      expect.objectContaining({ internal_name: 'unlisted', count: 1 }),
    ]));
  });

  it('normalizes map resources, spawns, cores, wave summaries, and a clearly approximate path distance', () => {
    const result = analyzeMapMetadata({
      width: 80,
      height: 60,
      game_modes: ['attack', 'survival'],
      planet: 'serpulo',
      rules: { waves: true, wave_spacing: 600 },
      resources: [
        { type: 'item', name: 'copper', amount: 10, x: 1, y: 2 },
        { type: 'item', name: 'copper', amount: 5, x: 2, y: 2 },
      ],
      spawn_points: [{ team: 'sharded', x: 0, y: 0 }],
      cores: [{ team: 'sharded', x: 3, y: 4, type: 'core-shard' }],
      wave_groups: [
        { unit: 'dagger', begin: 1, end: 5, spacing: 2, amount: 3, team: 'crux' },
        { unit: 'crawler', begin: 1, end: 5, spacing: 2, amount: 2, team: 'crux' },
      ],
    });

    expect(result.metadata).toMatchObject({ width: 80, height: 60, game_mode: 'attack', game_modes_json: ['attack', 'survival'], planet: 'serpulo' });
    expect(result.resources).toEqual([expect.objectContaining({ resource_type: 'item', internal_name: 'copper', amount: 15 })]);
    expect(result.spawns).toEqual([{ spawn_type: 'player', team: 'sharded', x: 0, y: 0, wave: null }]);
    expect(result.cores).toEqual([{ core_type: 'core-shard', team: 'sharded', x: 3, y: 4 }]);
    expect(result.waves).toEqual([expect.objectContaining({ wave_start: 1, wave_end: 5, enemy_count: 15, estimated_health: null, details_json: expect.objectContaining({ estimated: true, group_count: 2 }) })]);
    expect(result.analysis.estimated_difficulty).toBeGreaterThan(0);
    expect(result.analysis.difficulty_confidence).toBe('low');
    expect(result.analysis.resource_balance_json).toMatchObject({ estimated: true, confidence: 'low', resource_entry_count: 1 });
    expect(result.analysis.path_analysis_json).toMatchObject({ estimated: true, available: true, method: 'euclidean_tile_distance_not_pathfinding', pairs: [{ distance_tiles: 5 }] });
    expect(result.analysis.warnings_json).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DIFFICULTY_HEURISTIC_UNCALIBRATED' }),
      expect.objectContaining({ code: 'PATH_ESTIMATE_EUCLIDEAN_ONLY' }),
    ]));
  });

  it('estimates wave health and air ratio from official unit metadata and flags strength spikes heuristically', () => {
    const result = analyzeMapMetadata({
      wave_groups: [
        { unit: 'dagger', begin: 1, end: 1, amount: 2, unit_health: 100, shields: 0, flying: false },
        { unit: 'flare', begin: 2, end: 2, amount: 5, unit_health: 200, shields: 10, flying: true, boss: true },
      ],
    });

    expect(result.waves).toEqual([
      expect.objectContaining({ wave_start: 1, enemy_count: 2, estimated_health: 200, air_ratio: 0, boss_count: 0, is_spike: false }),
      expect.objectContaining({ wave_start: 2, enemy_count: 5, estimated_health: 1050, air_ratio: 1, boss_count: 5, is_spike: true }),
    ]);
    expect(result.analysis.warnings_json).toContainEqual(expect.objectContaining({ code: 'WAVE_SPIKES_HEURISTIC' }));
  });

  it('preserves open-ended renderer waves without multiplying counts by the integer sentinel', () => {
    const result = analyzeMapMetadata({ wave_groups: [{ unit: 'dagger', begin: 3, end: 2_147_483_647, amount: 2, unit_health: 100, flying: false }] });

    expect(result.waves).toEqual([expect.objectContaining({
      wave_start: 3, wave_end: 2_147_483_647, enemy_count: 2, estimated_health: 200, air_ratio: 0,
    })]);
    expect(result.analysis.estimated_difficulty).toBeLessThan(100);
  });

  it('does not reinterpret renderer spawn counts as coordinates or claim unavailable resource/path data', () => {
    const result = analyzeMapMetadata({
      spawns: 4,
      core_count: 2,
      cores: [{ team: 'crux', x: 8, y: 9 }],
      game_modes: ['attack'],
      rules: { waves: true },
      wave_groups: [],
    });
    expect(result.spawns).toEqual([]);
    expect(result.analysis.estimated_difficulty).toBeNull();
    expect(result.analysis.resource_balance_json).toMatchObject({ available: false, resource_entry_count: 0 });
    expect(result.analysis.path_analysis_json).toMatchObject({ available: false, estimated: true, pairs: [] });
    expect(result.analysis.warnings_json).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MAP_RESOURCES_UNAVAILABLE' }),
      expect.objectContaining({ code: 'MAP_SPAWN_POSITIONS_UNAVAILABLE' }),
      expect.objectContaining({ code: 'MAP_CORE_COORDINATES_PARTIAL' }),
      expect.objectContaining({ code: 'MAP_WAVE_GROUPS_UNAVAILABLE' }),
      expect.objectContaining({ code: 'PATH_ESTIMATE_UNAVAILABLE' }),
    ]));
  });

  it('bounds malformed, oversized, cyclic, and excessive-array metadata', () => {
    const malformed = analyzeSchematicMetadata('{bad json');
    expect(malformed.analysis.status).toBe('partial');
    expect(malformed.analysis.warnings_json).toContainEqual(expect.objectContaining({ code: 'MALFORMED_METADATA_JSON' }));

    const oversized = analyzeMapMetadata('x'.repeat(RENDERER_ANALYZER_LIMITS.maxJsonChars + 1));
    expect(oversized.resources).toEqual([]);
    expect(oversized.analysis.warnings_json).toContainEqual(expect.objectContaining({ code: 'INPUT_TOO_LARGE' }));

    const input: Record<string, unknown> = { cores: [{ x: 1, y: 2 }], spawn_points: [{ x: 0, y: 0 }] };
    input.circular = input;
    Object.defineProperty(input, '__proto__', { value: { polluted: true }, enumerable: true });
    input.wave_groups = Array.from({ length: RENDERER_ANALYZER_LIMITS.maxListItems + 1 }, (_, index) => ({ begin: index, end: index, amount: 1 }));
    const bounded = analyzeMapMetadata(input);
    expect(bounded.analysis.warnings_json).toContainEqual(expect.objectContaining({ code: 'METADATA_TRUNCATED' }));
    expect(bounded.waves.length).toBeLessThanOrEqual(RENDERER_ANALYZER_LIMITS.maxListItems);
    expect(bounded.metadata.source_renderer_metadata_json.circular).toBeNull();
    expect(bounded.metadata.source_renderer_metadata_json).not.toHaveProperty('__proto__');
  });
});

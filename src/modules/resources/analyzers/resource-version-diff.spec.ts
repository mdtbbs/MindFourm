import { diffStructuredVersion } from './resource-version-diff';

describe('diffStructuredVersion', () => {
  it('compares schematic structure, material counts, production estimates, and dependencies', () => {
    const diff = diffStructuredVersion('schematic', {
      metadata: { width: 4, height: 4, structure_hash: 'old' },
      blocks: [{ internal_name: 'graphite-press', count: 1 }, { internal_name: 'vault', count: 2 }],
      materials: [{ internal_name: 'copper', amount: 20 }],
      dependencies: ['oldmod'],
      analysis: { production_json: { estimated: true, power: { net: -2 } }, logic_processor_count: 0 },
    }, {
      metadata: { width: 5, height: 4, structure_hash: 'new' },
      blocks: [{ internal_name: 'graphite-press', count: 3 }, { internal_name: 'battery', count: 1 }],
      materials: [{ internal_name: 'copper', amount: 35 }],
      dependencies: ['newmod'],
      analysis: { production_json: { estimated: true, power: { net: 4 } }, logic_processor_count: 1 },
    });

    expect(diff.metadata).toEqual([
      { field: 'width', before: 4, after: 5 },
      { field: 'structure_hash', before: 'old', after: 'new' },
    ]);
    expect(diff.blocks).toMatchObject({
      added: [{ internal_name: 'battery', count: 1 }],
      removed: [{ internal_name: 'vault', count: 2 }],
      changed: [{ key: 'graphite-press', before: { count: 1 }, after: { count: 3 } }],
    });
    expect(diff.materials.changed).toHaveLength(1);
    expect(diff.power_net_delta).toBe(6);
    expect(diff.dependencies.added).toEqual([{ internal_name: 'newmod' }]);
    expect(diff.dependencies.removed).toEqual([{ internal_name: 'oldmod' }]);
    expect(diff.estimated).toBe(true);
  });

  it('compares map rules, resource distribution, spawns, cores, waves, and estimated analysis', () => {
    const diff = diffStructuredVersion('map', {
      metadata: { width: 100, height: 80, rules_json: { waves: true } },
      resources: [{ resource_type: 'item', internal_name: 'copper', amount: 2 }],
      cores: [{ core_type: 'shard', team: 'blue', x: 2, y: 3 }],
      spawns: [{ spawn_type: 'enemy', team: 'red', x: 9, y: 9, wave: 1 }],
      waves: [{ wave_start: 1, wave_end: 1, enemy_count: 2 }],
      analysis: { estimated_difficulty: 10, difficulty_confidence: 'low' },
    }, {
      metadata: { width: 120, height: 80, rules_json: { waves: false } },
      resources: [{ resource_type: 'item', internal_name: 'copper', amount: 3 }],
      cores: [{ core_type: 'shard', team: 'blue', x: 2, y: 3 }],
      spawns: [{ spawn_type: 'enemy', team: 'red', x: 10, y: 9, wave: 1 }],
      waves: [{ wave_start: 1, wave_end: 2, enemy_count: 5 }],
      analysis: { estimated_difficulty: 18, difficulty_confidence: 'low' },
    });

    expect(diff.metadata).toEqual([
      { field: 'width', before: 100, after: 120 },
      { field: 'rules_json', before: { waves: true }, after: { waves: false } },
    ]);
    expect(diff.resources.changed).toHaveLength(1);
    expect(diff.cores.added).toHaveLength(0);
    expect(diff.spawns.added).toHaveLength(1);
    expect(diff.waves.added).toHaveLength(1);
    expect(diff.analysis).toMatchObject({ estimated: true, before: { estimated_difficulty: 10 }, after: { estimated_difficulty: 18 } });
    expect(diff.estimated).toBe(true);
  });
});

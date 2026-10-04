import {
  AnalyzerWarning,
  boundedNumber,
  boundedString,
  boundedJson,
  list,
  parseRendererMetadata,
  record,
  uniqueWarnings,
  warning,
} from './renderer-metadata.util';

export const MAP_ANALYZER_VERSION = 'mdtbbs-map-metadata-1';

export type MapResourceRecord = {
  resource_type: string;
  internal_name: string;
  amount: number | null;
  distribution_json: Record<string, unknown> | null;
};
export type MapSpawnRecord = {
  spawn_type: string;
  team: string | null;
  x: number | null;
  y: number | null;
  wave: number | null;
};
export type MapCoreRecord = { core_type: string | null; team: string | null; x: number | null; y: number | null };
export type MapWaveSummaryRecord = {
  wave_start: number;
  wave_end: number;
  enemy_count: number | null;
  estimated_health: number | null;
  air_ratio: number | null;
  boss_count: number;
  strength: number | null;
  is_spike: boolean;
  details_json: Record<string, unknown> | null;
};

export type MapAnalyzerResult = {
  parser_version: string;
  metadata: {
    width: number | null;
    height: number | null;
    game_mode: string | null;
    game_modes_json: string[];
    planet: string | null;
    player_count: number | null;
    playtime_seconds: number | null;
    game_version_min: string | null;
    game_version_max: string | null;
    rules_json: Record<string, unknown>;
    parser_version: string;
    source_renderer_metadata_json: Record<string, unknown>;
    source_metadata_json: Record<string, unknown> | null;
  };
  resources: MapResourceRecord[];
  spawns: MapSpawnRecord[];
  cores: MapCoreRecord[];
  waves: MapWaveSummaryRecord[];
  analysis: {
    parser_version: string;
    status: 'completed' | 'partial';
    difficulty_confidence: 'low';
    estimated_difficulty: number | null;
    resource_balance_json: Record<string, unknown>;
    path_analysis_json: Record<string, unknown>;
    warnings_json: AnalyzerWarning[];
  };
};

/** Builds bounded descriptive summaries from renderer metadata; it does not simulate or pathfind. */
export function analyzeMapMetadata(rendererInput: unknown, publisherInput?: unknown): MapAnalyzerResult {
  const parsedRenderer = parseRendererMetadata(rendererInput);
  const parsedPublisher = publisherInput === undefined ? null : parseRendererMetadata(publisherInput);
  const renderer = parsedRenderer.value;
  const publisher = parsedPublisher?.value ?? {};
  const warnings: AnalyzerWarning[] = [...parsedRenderer.warnings, ...(parsedPublisher?.warnings ?? [])];

  const resources = normalizeResources(renderer, warnings);
  const spawns = normalizeSpawns(renderer, warnings);
  const cores = normalizeCores(renderer, warnings);
  const waves = normalizeWaves(renderer, warnings);
  const maxWave = waves.reduce((maximum, item) => Math.max(maximum, item.wave_end), 0);
  const estimatedEnemies = waves.reduce((total, item) => total + (item.enemy_count ?? 0), 0);
  const totalBosses = waves.reduce((total, item) => total + item.boss_count, 0);
  const difficulty = waves.length > 0
    ? Math.min(100, round2(Math.max(0, maxWave * 0.25 + Math.log2(1 + estimatedEnemies) * 8 + totalBosses * 8)))
    : null;
  if (difficulty !== null) warnings.push(warning('DIFFICULTY_HEURISTIC_UNCALIBRATED', 'Difficulty is a low-confidence wave-count heuristic, not a game simulation or calibrated rating.', 'info'));
  const resourceBalance = summarizeBalance(resources, spawns, cores, waves, warnings);
  const pathAnalysis = estimatePath(spawns, cores, warnings);
  const modeValues = normalizeStringList(renderer.game_modes ?? renderer.game_mode ?? publisher.game_modes ?? publisher.game_mode, warnings, 'GAME_MODES_TRUNCATED');
  const rules = record(renderer.rules);

  if (resources.length === 0) warnings.push(warning('MAP_RESOURCES_UNAVAILABLE', 'The current renderer metadata contains no structured resource deposit list.'));
  if (spawns.length === 0) warnings.push(warning('MAP_SPAWN_POSITIONS_UNAVAILABLE', 'Renderer spawn count is not a coordinate list; spawn positions cannot be reconstructed.'));
  if (cores.length === 0) warnings.push(warning('MAP_CORE_POSITIONS_UNAVAILABLE', 'No structured core coordinates were supplied by the renderer.'));
  if (waves.length === 0 && rules.waves === true) warnings.push(warning('MAP_WAVE_GROUPS_UNAVAILABLE', 'Wave mode is enabled but no structured wave groups were supplied.'));

  return {
    parser_version: MAP_ANALYZER_VERSION,
    metadata: {
      width: boundedNumber(renderer.width, { min: 0, max: 100_000, integer: true }),
      height: boundedNumber(renderer.height, { min: 0, max: 100_000, integer: true }),
      game_mode: boundedString(renderer.game_mode ?? modeValues[0], 100),
      game_modes_json: modeValues,
      planet: boundedString(renderer.planet ?? publisher.planet, 100),
      player_count: boundedNumber(renderer.player_count ?? publisher.player_count, { min: 0, max: 1_000_000, integer: true }),
      playtime_seconds: boundedNumber(renderer.playtime_seconds ?? publisher.playtime_seconds, { min: 0, max: 1_000_000_000, integer: true }),
      game_version_min: boundedString(renderer.game_version_min ?? publisher.game_version_min, 80),
      game_version_max: boundedString(renderer.game_version_max ?? publisher.game_version_max, 80),
      rules_json: rules,
      parser_version: MAP_ANALYZER_VERSION,
      source_renderer_metadata_json: renderer,
      source_metadata_json: parsedPublisher ? publisher : null,
    },
    resources,
    spawns,
    cores,
    waves,
    analysis: {
      parser_version: MAP_ANALYZER_VERSION,
      status: warnings.some((item) => item.severity === 'warning') ? 'partial' : 'completed',
      difficulty_confidence: 'low',
      estimated_difficulty: difficulty,
      resource_balance_json: resourceBalance,
      path_analysis_json: pathAnalysis,
      warnings_json: uniqueWarnings(warnings),
    },
  };
}

function normalizeResources(renderer: Record<string, unknown>, warnings: AnalyzerWarning[]): MapResourceRecord[] {
  const raw = renderer.resources ?? renderer.resource_entries ?? renderer.map_resources ?? renderer.ore_deposits;
  const source = list(raw);
  if (source.truncated) warnings.push(warning('MAP_RESOURCES_TRUNCATED', 'The resource deposit list exceeded the analysis limit.'));
  const sums = new Map<string, { resource_type: string; amount: number | null; distribution: Record<string, unknown>; samples: number }>();
  for (const itemValue of source.values) {
    const item = record(itemValue);
    const name = resourceName(item.internal_name ?? item.name ?? item.item ?? item.resource ?? item.block);
    if (!name) continue;
    const resourceType = boundedString(item.resource_type ?? item.type, 32) ?? 'item';
    const amount = boundedNumber(item.amount ?? item.count, { min: 0, max: 1_000_000_000 });
    const key = `${resourceType}\u0000${name}`;
    const existing = sums.get(key) ?? { resource_type: resourceType, amount: amount === null ? null : 0, distribution: {}, samples: 0 };
    if (amount !== null) existing.amount = (existing.amount ?? 0) + amount;
    existing.samples += 1;
    const distribution = record(item.distribution ?? item.distribution_json);
    if (Object.keys(distribution).length && Object.keys(existing.distribution).length === 0) existing.distribution = boundedJson(distribution) as Record<string, unknown>;
    sums.set(key, existing);
  }
  return [...sums.entries()].slice(0, 500).map(([key, item]) => ({
    resource_type: item.resource_type,
    internal_name: key.slice(key.indexOf('\0') + 1),
    amount: item.amount === null ? null : round2(item.amount),
    distribution_json: { ...item.distribution, sample_count: item.samples, estimated: true },
  })).sort((left, right) => left.resource_type.localeCompare(right.resource_type) || left.internal_name.localeCompare(right.internal_name));
}

function normalizeSpawns(renderer: Record<string, unknown>, warnings: AnalyzerWarning[]): MapSpawnRecord[] {
  const raw = Array.isArray(renderer.spawn_points) ? renderer.spawn_points
    : Array.isArray(renderer.spawn_positions) ? renderer.spawn_positions
      : Array.isArray(renderer.player_spawns) ? renderer.player_spawns
        : Array.isArray(renderer.spawns) ? renderer.spawns : [];
  const source = list(raw);
  if (source.truncated) warnings.push(warning('MAP_SPAWNS_TRUNCATED', 'The spawn coordinate list exceeded the analysis limit.'));
  const normalized = source.values.map((value) => {
    const item = record(value);
    return {
      spawn_type: boundedString(item.spawn_type ?? item.type, 32) ?? 'player',
      team: boundedString(item.team, 64),
      x: boundedNumber(item.x, { min: -1_000_000, max: 1_000_000, integer: true }),
      y: boundedNumber(item.y, { min: -1_000_000, max: 1_000_000, integer: true }),
      wave: boundedNumber(item.wave, { min: 0, max: 1_000_000, integer: true }),
    };
  }).filter((item) => item.x !== null && item.y !== null).slice(0, 500);
  const unique = new Map<string, MapSpawnRecord>();
  for (const item of normalized) unique.set(`${item.spawn_type}\0${item.team ?? ''}\0${item.x}\0${item.y}\0${item.wave ?? ''}`, item);
  return [...unique.values()];
}

function normalizeCores(renderer: Record<string, unknown>, warnings: AnalyzerWarning[]): MapCoreRecord[] {
  const source = list(renderer.cores);
  if (source.truncated) warnings.push(warning('MAP_CORES_TRUNCATED', 'The core coordinate list exceeded the analysis limit.'));
  const normalized = source.values.map((value) => {
    const item = record(value);
    return {
      core_type: boundedString(item.core_type ?? item.type, 32),
      team: boundedString(item.team, 64),
      x: boundedNumber(item.x, { min: -1_000_000, max: 1_000_000, integer: true }),
      y: boundedNumber(item.y, { min: -1_000_000, max: 1_000_000, integer: true }),
    };
  }).filter((item) => item.x !== null && item.y !== null).slice(0, 500);
  const unique = new Map<string, MapCoreRecord>();
  for (const item of normalized) unique.set(`${item.core_type ?? ''}\0${item.team ?? ''}\0${item.x}\0${item.y}`, item);
  const output = [...unique.values()];
  const count = boundedNumber(renderer.core_count, { min: 0, max: 1_000_000, integer: true });
  if (count !== null && count > output.length) warnings.push(warning('MAP_CORE_COORDINATES_PARTIAL', 'Renderer core count exceeds the supplied core coordinate list.'));
  return output;
}

function normalizeWaves(renderer: Record<string, unknown>, warnings: AnalyzerWarning[]): MapWaveSummaryRecord[] {
  const sourceValue = renderer.wave_groups ?? (Array.isArray(renderer.waves) ? renderer.waves : []);
  const source = list(sourceValue);
  if (source.truncated) warnings.push(warning('MAP_WAVE_GROUPS_TRUNCATED', 'The wave group list exceeded the analysis limit.'));
  const groups = new Map<string, MapWaveSummaryRecord>();
  for (const value of source.values) {
    const item = record(value);
    const begin = boundedNumber(item.begin ?? item.wave_start ?? item.start, { min: 0, max: 1_000_000, integer: true });
    const end = boundedNumber(item.end ?? item.wave_end ?? item.begin ?? item.wave_start ?? item.start, { min: 0, max: 1_000_000, integer: true });
    const amount = boundedNumber(item.amount ?? item.unit_amount ?? item.unitAmount ?? item.enemy_count, { min: 0, max: 1_000_000, integer: true });
    if (begin === null || end === null || end < begin) continue;
    const spacing = boundedNumber(item.spacing, { min: 1, max: 1_000_000, integer: true }) ?? 1;
    const waveCount = Math.floor((end - begin) / spacing) + 1;
    const estimatedTotal = amount === null ? null : Math.min(1_000_000_000, amount * waveCount);
    const bossCount = item.boss === true || item.is_boss === true
      ? waveCount
      : boundedNumber(item.boss_count, { min: 0, max: 1_000_000, integer: true }) ?? 0;
    const key = `${begin}:${end}`;
    const existing = groups.get(key);
    const groupCount = existing ? Number(existing.details_json?.group_count ?? 1) + 1 : 1;
    const groupDetail = {
      estimated: true,
      spacing,
      amount_per_wave: amount,
      ...(boundedString(item.unit ?? item.unit_type, 191) ? { unit: boundedString(item.unit ?? item.unit_type, 191) } : {}),
      ...(boundedString(item.team, 64) ? { team: boundedString(item.team, 64) } : {}),
    };
    const details: Record<string, unknown> = {
      estimated: true,
      method: 'renderer_spawn_group_projection',
      group_count: groupCount,
      spacing,
      amount_per_wave: amount,
    };
    if (existing) {
      existing.enemy_count = existing.enemy_count === null || estimatedTotal === null ? null : existing.enemy_count + estimatedTotal;
      existing.boss_count += bossCount;
      existing.strength = existing.enemy_count;
      const priorGroups = Array.isArray(existing.details_json?.groups) ? existing.details_json.groups : [];
      existing.details_json = { ...existing.details_json, group_count: groupCount, groups: [...priorGroups, groupDetail].slice(0, 100) };
    } else {
      groups.set(key, {
        wave_start: begin,
        wave_end: end,
        enemy_count: estimatedTotal,
        estimated_health: null,
        air_ratio: boundedNumber(item.air_ratio, { min: 0, max: 1 }),
        boss_count: bossCount,
        strength: estimatedTotal,
        is_spike: item.is_spike === true,
        details_json: { ...details, groups: [groupDetail] },
      });
    }
  }
  if (groups.size > 0) warnings.push(warning('WAVE_SUMMARY_ESTIMATED', 'Wave summaries project renderer spawn groups; unit health, pathing, and in-game modifiers are not simulated.', 'info'));
  return [...groups.values()].sort((left, right) => left.wave_start - right.wave_start || left.wave_end - right.wave_end).slice(0, 500);
}

function summarizeBalance(resources: MapResourceRecord[], spawns: MapSpawnRecord[], cores: MapCoreRecord[], waves: MapWaveSummaryRecord[], warnings: AnalyzerWarning[]): Record<string, unknown> {
  const teams = new Set([...spawns.map((item) => item.team), ...cores.map((item) => item.team)].filter((item): item is string => !!item));
  const enemies = waves.map((item) => item.enemy_count).filter((item): item is number => item !== null);
  const balance: Record<string, unknown> = {
    estimated: true,
    confidence: 'low',
    method: 'metadata_indicators_only',
    available: resources.length > 0,
    resource_entry_count: resources.length,
    resource_types: [...new Set(resources.map((item) => item.resource_type))].sort(),
    spawn_count: spawns.length,
    core_count: cores.length,
    team_count: teams.size,
    wave_group_count: waves.length,
  };
  if (enemies.length > 1) {
    const mean = enemies.reduce((sum, item) => sum + item, 0) / enemies.length;
    const spread = Math.max(...enemies) - Math.min(...enemies);
    balance.wave_group_enemy_spread = { estimated: true, range: spread, coefficient_of_variation: mean > 0 ? round2(Math.sqrt(enemies.reduce((sum, item) => sum + (item - mean) ** 2, 0) / enemies.length) / mean) : null };
  } else {
    balance.wave_group_enemy_spread = null;
  }
  balance.interpretation = resources.length === 0
    ? 'Resource balance cannot be estimated without structured resource deposits.'
    : 'Resource counts are descriptive metadata; miner reach, terrain yield, and team access are unknown.';
  if (resources.length === 0) warnings.push(warning('RESOURCE_BALANCE_UNAVAILABLE', 'No resource deposits were supplied, so resource sufficiency cannot be estimated.'));
  balance.difficulty_heuristic = waves.length > 0 ? {
    estimated: true,
    calibrated: false,
    version: 'map-difficulty-heuristic-1',
    formula: 'min(100, 0.25 * max_wave + 8 * log2(1 + estimated_enemy_count) + 8 * estimated_boss_count)',
    max_wave: Math.max(...waves.map((item) => item.wave_end)),
    estimated_enemy_count: enemies.reduce((sum, item) => sum + item, 0),
    estimated_boss_count: waves.reduce((sum, item) => sum + item.boss_count, 0),
  } : null;
  return balance;
}

function estimatePath(spawns: MapSpawnRecord[], cores: MapCoreRecord[], warnings: AnalyzerWarning[]): Record<string, unknown> {
  if (spawns.length === 0 || cores.length === 0) {
    warnings.push(warning('PATH_ESTIMATE_UNAVAILABLE', 'Spawn-to-core distance requires renderer coordinates for both spawns and cores.'));
    return { available: false, estimated: true, method: 'euclidean_tile_distance_not_pathfinding', pairs: [] };
  }
  if (spawns.length > 100) warnings.push(warning('PATH_ESTIMATE_TRUNCATED', 'Only the first 100 spawn coordinates were used for nearest-core distance estimates.'));
  const pairs = spawns.slice(0, 100).map((spawn, spawnIndex) => {
    let closest: { core_index: number; distance_tiles: number } | null = null;
    for (let coreIndex = 0; coreIndex < cores.length; coreIndex += 1) {
      const core = cores[coreIndex];
      const distance = Math.sqrt(((spawn.x ?? 0) - (core.x ?? 0)) ** 2 + ((spawn.y ?? 0) - (core.y ?? 0)) ** 2);
      if (!closest || distance < closest.distance_tiles) closest = { core_index: coreIndex, distance_tiles: round2(distance) };
    }
    return closest ? { spawn_index: spawnIndex, nearest_core_index: closest.core_index, distance_tiles: closest.distance_tiles } : null;
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  warnings.push(warning('PATH_ESTIMATE_EUCLIDEAN_ONLY', 'Distances are straight-line tile estimates; terrain, walls, movement type, and actual pathfinding are not modeled.', 'info'));
  return {
    available: pairs.length > 0,
    estimated: true,
    method: 'euclidean_tile_distance_not_pathfinding',
    pairs,
    minimum_distance_tiles: pairs.length ? Math.min(...pairs.map((item) => item.distance_tiles)) : null,
    maximum_distance_tiles: pairs.length ? Math.max(...pairs.map((item) => item.distance_tiles)) : null,
  };
}

function normalizeStringList(value: unknown, warnings: AnalyzerWarning[], code: string): string[] {
  const source = Array.isArray(value) ? list(value) : typeof value === 'string' ? list(value.split(/[\s,]+/)) : { values: [], truncated: false };
  if (source.truncated) warnings.push(warning(code, 'The game mode list exceeded the analysis limit.'));
  return [...new Set(source.values.map((item) => boundedString(item, 100)).filter((item): item is string => item !== null))].slice(0, 100);
}

function resourceName(value: unknown): string | null {
  const name = boundedString(value, 191);
  return name && /^[A-Za-z0-9_.:-]+$/.test(name) ? name : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

import { DataSource } from 'typeorm';

export type ResourceV2StructureResult = {
  map_metadata_created: number;
  map_metadata_skipped: number;
  map_resources_created: number;
  map_resources_skipped: number;
  map_spawns_created: number;
  map_spawns_skipped: number;
  map_cores_created: number;
  map_cores_skipped: number;
  map_waves_created: number;
  map_waves_skipped: number;
  map_analyses_created: number;
  map_analyses_skipped: number;
  schematic_metadata_created: number;
  schematic_metadata_skipped: number;
  schematic_blocks_created: number;
  schematic_blocks_skipped: number;
  schematic_materials_created: number;
  schematic_materials_skipped: number;
  schematic_logic_processors_created: number;
  schematic_logic_processors_skipped: number;
  schematic_analyses_created: number;
  schematic_analyses_skipped: number;
};

const COUNTERS = [
  'map_metadata', 'map_resources', 'map_spawns', 'map_cores', 'map_waves', 'map_analyses',
  'schematic_metadata', 'schematic_blocks', 'schematic_materials', 'schematic_logic_processors', 'schematic_analyses',
] as const;

export function emptyResourceV2StructureResult(): ResourceV2StructureResult {
  return Object.fromEntries(COUNTERS.flatMap((key) => [[`${key}_created`, 0], [`${key}_skipped`, 0]])) as ResourceV2StructureResult;
}

/**
 * Copies legacy resource JSON into version-owned tables. This deliberately takes
 * an existing root ResourceVersion id and never creates or mutates a Resource.
 */
export async function backfillResourceVersionStructure(
  dataSource: DataSource,
  resource: Record<string, any>,
  versionId: number,
  mode: 'dry-run' | 'write',
): Promise<ResourceV2StructureResult> {
  const result = emptyResourceV2StructureResult();
  if (!Number.isInteger(versionId) || versionId <= 0) return result;

  const renderer = parseObject(resource.renderer_metadata_json);
  const publisher = parseObject(resource.metadata_json);
  const kind = String(resource.resource_kind || '').toLowerCase();

  if (kind === 'map') await backfillMap(dataSource, versionId, renderer, publisher, mode, result);
  if (kind === 'schematic') await backfillSchematic(dataSource, versionId, renderer, publisher, mode, result);
  return result;
}

async function backfillMap(
  dataSource: DataSource,
  versionId: number,
  renderer: Record<string, any>,
  publisher: Record<string, any>,
  mode: 'dry-run' | 'write',
  result: ResourceV2StructureResult,
): Promise<void> {
  const gameModes = uniqueStrings(publisher.game_modes ?? publisher.gamemodes, renderer.game_modes);
  const planets = uniqueStrings(publisher.planets ?? publisher.planet, renderer.planet);
  const metadata = [
    versionId,
    finiteNumber(renderer.width), finiteNumber(renderer.height),
    shortString(renderer.game_mode ?? gameModes[0], 100), json(gameModes), shortString(planets[0], 100),
    unsignedInteger(renderer.player_count), unsignedInteger(renderer.playtime_seconds),
    shortString(renderer.game_version_min, 80), shortString(renderer.game_version_max, 80),
    jsonObject(renderer.rules), shortString(resourceParserVersion(renderer), 100),
    json(renderer), json(publisher),
  ];
  await insertOne(dataSource, mode, result, 'map_metadata', `INSERT IGNORE INTO map_version_metadata
    (resource_version_id,width,height,game_mode,game_modes_json,planet,player_count,playtime_seconds,game_version_min,game_version_max,rules_json,parser_version,source_renderer_metadata_json,source_metadata_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, metadata, { table: 'map_version_metadata', columns: ['resource_version_id'], values: [versionId] });

  for (const row of mapResourceRows(renderer)) {
    await insertOne(dataSource, mode, result, 'map_resources', `INSERT IGNORE INTO map_resource_entries
      (resource_version_id,resource_type,internal_name,amount,distribution_json) VALUES (?,?,?,?,?)`,
    [versionId, row.resourceType, row.name, finiteNumber(row.amount), jsonObject(row.distribution)],
    { table: 'map_resource_entries', columns: ['resource_version_id', 'resource_type', 'internal_name'], values: [versionId, row.resourceType, row.name] });
  }
  for (const row of mapSpawnRows(renderer)) {
    await insertOne(dataSource, mode, result, 'map_spawns', `INSERT IGNORE INTO map_spawns
      (resource_version_id,spawn_type,team,x,y,wave) VALUES (?,?,?,?,?,?)`,
    [versionId, row.spawnType, row.team, row.x, row.y, row.wave],
    { table: 'map_spawns', columns: ['resource_version_id', 'spawn_type', 'team', 'x', 'y', 'wave'], values: [versionId, row.spawnType, row.team, row.x, row.y, row.wave] });
  }
  for (const row of mapCoreRows(renderer)) {
    await insertOne(dataSource, mode, result, 'map_cores', `INSERT IGNORE INTO map_cores
      (resource_version_id,core_type,team,x,y) VALUES (?,?,?,?,?)`,
    [versionId, row.coreType, row.team, row.x, row.y],
    { table: 'map_cores', columns: ['resource_version_id', 'core_type', 'team', 'x', 'y'], values: [versionId, row.coreType, row.team, row.x, row.y] });
  }
  for (const row of mapWaveRows(renderer)) {
    await insertOne(dataSource, mode, result, 'map_waves', `INSERT IGNORE INTO map_wave_summaries
      (resource_version_id,wave_start,wave_end,enemy_count,estimated_health,air_ratio,boss_count,strength,is_spike,details_json)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [versionId, row.start, row.end, unsignedInteger(row.enemyCount), unsignedInteger(row.estimatedHealth),
      finiteNumber(row.airRatio), unsignedInteger(row.bossCount) ?? 0, finiteNumber(row.strength), row.isSpike ? 1 : 0, jsonObject(row.details)],
    { table: 'map_wave_summaries', columns: ['resource_version_id', 'wave_start', 'wave_end'], values: [versionId, row.start, row.end] });
  }

  const analysis = parseObject(renderer.analysis);
  if (Object.keys(analysis).length > 0) {
    await insertOne(dataSource, mode, result, 'map_analyses', `INSERT IGNORE INTO map_analyses
      (resource_version_id,parser_version,status,difficulty_confidence,estimated_difficulty,resource_balance_json,path_analysis_json,warnings_json)
      VALUES (?,?,?,?,?,?,?,?)`,
    [versionId, shortString(resourceParserVersion(renderer), 100), 'completed',
      shortString(analysis.difficulty_confidence ?? 'estimated', 24), finiteNumber(analysis.estimated_difficulty ?? analysis.difficulty),
      jsonObject(analysis.resource_balance), jsonObject(analysis.path_analysis), jsonArray(analysis.warnings)],
    { table: 'map_analyses', columns: ['resource_version_id'], values: [versionId] });
  }
}

async function backfillSchematic(
  dataSource: DataSource,
  versionId: number,
  renderer: Record<string, any>,
  publisher: Record<string, any>,
  mode: 'dry-run' | 'write',
  result: ResourceV2StructureResult,
): Promise<void> {
  const compatibility = parseObject(renderer.compatibility);
  const metadata = [
    versionId, unsignedInteger(renderer.width), unsignedInteger(renderer.height), unsignedInteger(renderer.blocks),
    shortString(renderer.content_hash, 64), shortString(renderer.structure_hash, 64), shortString(renderer.normalized_structure_hash, 64),
    unsignedInteger(compatibility.minimum_supported_build ?? renderer.min_supported_build),
    finiteNumber(renderer.schematic_format_version), shortString(resourceParserVersion(renderer), 100),
    json(uniqueStrings(renderer.mod_dependencies, publisher.required_mods)), json(renderer), json(publisher),
  ];
  await insertOne(dataSource, mode, result, 'schematic_metadata', `INSERT IGNORE INTO schematic_version_metadata
    (resource_version_id,width,height,block_count,content_hash,structure_hash,normalized_structure_hash,min_supported_build,schematic_format_version,parser_version,dependencies_json,source_renderer_metadata_json,source_metadata_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, metadata, { table: 'schematic_version_metadata', columns: ['resource_version_id'], values: [versionId] });

  const positions = array(renderer.block_positions);
  const blocks = new Map<string, { count: number; positions: unknown[]; properties: Record<string, unknown> | null; displayName: string | null }>();
  for (const item of array(renderer.block_types)) {
    const value = parseObject(item);
    const name = shortString(value.internal_name ?? value.id ?? value.name ?? value.block, 191);
    if (!name) continue;
    const existing = blocks.get(name) || { count: 0, positions: [], properties: null, displayName: null };
    existing.count += Math.max(1, unsignedInteger(value.count) ?? 1);
    existing.displayName = shortString(value.display_name ?? value.localized_name, 255) || existing.displayName;
    existing.properties = parseObjectOrNull(value.properties) || existing.properties;
    blocks.set(name, existing);
  }
  for (const position of positions) {
    const value = parseObject(position);
    const name = shortString(value.internal_name ?? value.id ?? value.name ?? value.block, 191);
    if (name && blocks.has(name)) blocks.get(name)!.positions.push(position);
  }
  for (const [name, value] of blocks) {
    await insertOne(dataSource, mode, result, 'schematic_blocks', `INSERT IGNORE INTO schematic_blocks
      (resource_version_id,internal_name,display_name,count,positions_json,properties_json) VALUES (?,?,?,?,?,?)`,
    [versionId, name, value.displayName, value.count, json(value.positions), jsonObject(value.properties)],
    { table: 'schematic_blocks', columns: ['resource_version_id', 'internal_name'], values: [versionId, name] });
  }

  const requirements = array(renderer.requirements ?? publisher.requirements);
  const materials = new Map<string, number>();
  for (const item of requirements) {
    const value = parseObject(item);
    const name = shortString(value.internal_name ?? value.item ?? value.name ?? value.id, 191);
    const amount = unsignedInteger(value.amount ?? value.count);
    if (name && amount !== null) materials.set(name, (materials.get(name) || 0) + amount);
  }
  for (const [name, amount] of materials) {
    await insertOne(dataSource, mode, result, 'schematic_materials', `INSERT IGNORE INTO schematic_materials
      (resource_version_id,internal_name,amount) VALUES (?,?,?)`, [versionId, name, amount],
    { table: 'schematic_materials', columns: ['resource_version_id', 'internal_name'], values: [versionId, name] });
  }

  const processors = dedupeByJson(array(renderer.logic_processors ?? renderer.logicProcessors));
  for (const item of processors) {
    const value = parseObject(item);
    const x = finiteNumber(value.x ?? value.position_x);
    const y = finiteNumber(value.y ?? value.position_y);
    if (x === null || y === null) continue;
    await insertOne(dataSource, mode, result, 'schematic_logic_processors', `INSERT IGNORE INTO schematic_logic_processors
      (resource_version_id,position_x,position_y,processor_type,links_json,variables_json) VALUES (?,?,?,?,?,?)`,
    [versionId, x, y, shortString(value.processor_type ?? value.type, 64), jsonArray(value.links), jsonObject(value.variables)],
    { table: 'schematic_logic_processors', columns: ['resource_version_id', 'position_x', 'position_y'], values: [versionId, x, y] });
  }

  const production = parseObject(renderer.production);
  const warnings = array(renderer.warnings).concat(array(production.warnings));
  const analysisPresent = Object.keys(production).length > 0 || warnings.length > 0
    || renderer.power_production !== undefined || renderer.power_consumption !== undefined;
  if (analysisPresent) {
    await insertOne(dataSource, mode, result, 'schematic_analyses', `INSERT IGNORE INTO schematic_analyses
      (resource_version_id,parser_version,status,complete,available,estimated,production_json,bottlenecks_json,warnings_json)
      VALUES (?,?,?,?,?,?,?,?,?)`,
    [versionId, shortString(resourceParserVersion(renderer), 100), 'completed', production.complete ? 1 : 0,
      production.available ? 1 : 0, production.estimated === false ? 0 : 1,
      jsonObject(production), jsonArray(production.bottlenecks), json(warnings)],
    { table: 'schematic_analyses', columns: ['resource_version_id'], values: [versionId] });
  }
}

async function insertOne(
  dataSource: DataSource,
  mode: 'dry-run' | 'write',
  result: ResourceV2StructureResult,
  counter: typeof COUNTERS[number],
  sql: string,
  params: unknown[],
  identity: { table: string; columns: string[]; values: unknown[] },
): Promise<void> {
  if (mode === 'dry-run') {
    const clauses = identity.columns.map((column, index) => identity.values[index] === null
      ? `\`${column}\` IS NULL`
      : `\`${column}\` = ?`);
    const values = identity.values.filter((value) => value !== null);
    const existing = await dataSource.query(`SELECT id FROM \`${identity.table}\` WHERE ${clauses.join(' AND ')} LIMIT 1`, values as any[]);
    if (existing.length > 0) (result as any)[`${counter}_skipped`] += 1;
    else (result as any)[`${counter}_created`] += 1;
    return;
  }
  const response = await dataSource.query(sql, params as any[]);
  const packet = Array.isArray(response) && response.length === 1 && response[0] && typeof response[0] === 'object'
    ? response[0]
    : response;
  const affected = Number(packet?.affectedRows ?? packet?.affected ?? 1);
  if (affected > 0) (result as any)[`${counter}_created`] += affected;
  else (result as any)[`${counter}_skipped`] += 1;
}

function mapResourceRows(renderer: Record<string, any>): Array<{ resourceType: string; name: string; amount: unknown; distribution: unknown }> {
  const output: Array<{ resourceType: string; name: string; amount: unknown; distribution: unknown }> = [];
  for (const item of array(renderer.resources ?? renderer.resource_entries ?? renderer.resource_nodes)) {
    const value = parseObject(item);
    const name = shortString(value.internal_name ?? value.item ?? value.name ?? value.id, 191);
    const resourceType = shortString(value.resource_type ?? value.type ?? 'item', 32);
    if (name && resourceType) output.push({ resourceType, name, amount: value.amount ?? value.count, distribution: value.distribution });
  }
  return dedupeRows(output, (row) => `${row.resourceType}\0${row.name}`);
}

function mapSpawnRows(renderer: Record<string, any>): Array<Record<string, any>> {
  const output: Array<Record<string, any>> = [];
  for (const item of array(renderer.spawn_points ?? (Array.isArray(renderer.spawns) ? renderer.spawns : []))) {
    const value = parseObject(item);
    const x = finiteNumber(value.x ?? value.position_x);
    const y = finiteNumber(value.y ?? value.position_y);
    if (x === null || y === null) continue;
    output.push({ spawnType: shortString(value.spawn_type ?? value.type ?? 'player', 32) || 'player',
      team: shortString(value.team, 64) || '', x, y, wave: unsignedInteger(value.wave) ?? 0 });
  }
  return dedupeRows(output, (row) => [row.spawnType, row.team ?? '', row.x, row.y, row.wave ?? ''].join('\0'));
}

function mapCoreRows(renderer: Record<string, any>): Array<Record<string, any>> {
  const output: Array<Record<string, any>> = [];
  for (const item of array(renderer.cores ?? renderer.core_positions)) {
    const value = parseObject(item);
    const x = finiteNumber(value.x ?? value.position_x);
    const y = finiteNumber(value.y ?? value.position_y);
    if (x === null || y === null) continue;
    output.push({ coreType: shortString(value.core_type ?? value.type, 32) || '', team: shortString(value.team, 64) || '', x, y });
  }
  return dedupeRows(output, (row) => [row.coreType ?? '', row.team ?? '', row.x, row.y].join('\0'));
}

function mapWaveRows(renderer: Record<string, any>): Array<Record<string, any>> {
  const output: Array<Record<string, any>> = [];
  for (const item of array(renderer.wave_groups ?? renderer.waves_summary)) {
    const value = parseObject(item);
    const start = unsignedInteger(value.wave_start ?? value.start_wave ?? value.from ?? value.wave);
    const end = unsignedInteger(value.wave_end ?? value.end_wave ?? value.to ?? value.wave);
    if (start === null || end === null || end < start) continue;
    output.push({
      start, end, enemyCount: value.enemy_count ?? value.enemies, estimatedHealth: value.estimated_health ?? value.health,
      airRatio: value.air_ratio, bossCount: value.boss_count ?? value.bosses, strength: value.strength,
      isSpike: value.is_spike ?? value.spike, details: value,
    });
  }
  return dedupeRows(output, (row) => `${row.start}\0${row.end}`);
}

function resourceParserVersion(renderer: Record<string, any>): string | null {
  const runtime = parseObject(renderer.parser_runtime);
  return shortString(renderer.parser_version ?? runtime.version, 100);
}

function parseObject(value: unknown): Record<string, any> {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function parseObjectOrNull(value: unknown): Record<string, unknown> | null {
  const parsed = parseObject(value);
  return Object.keys(parsed).length > 0 ? parsed : null;
}

function array(value: unknown): unknown[] {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value : [];
}

function json(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try { return JSON.stringify(value); } catch { return null; }
}

function jsonObject(value: unknown): string | null {
  const parsed = parseObject(value);
  return Object.keys(parsed).length > 0 ? json(parsed) : null;
}

function jsonArray(value: unknown): string | null {
  const parsed = array(value);
  return parsed.length > 0 ? json(parsed) : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function unsignedInteger(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? Math.floor(number) : null;
}

function shortString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function uniqueStrings(...values: unknown[]): string[] {
  const result = new Set<string>();
  for (const value of values) {
    const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    for (const item of list) if (typeof item === 'string' && item.trim()) result.add(item.trim());
  }
  return [...result].slice(0, 100);
}

function dedupeRows<T>(rows: T[], keyOf: (row: T) => string): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = keyOf(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeByJson(rows: unknown[]): unknown[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = json(row) ?? '';
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

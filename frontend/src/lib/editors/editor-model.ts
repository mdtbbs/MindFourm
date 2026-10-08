import type { EditorAnalysis, EditorContentEntry } from './editor-api';

export type SchematicPlacement = {
  id: string;
  source_x: number | null;
  source_y: number | null;
  x: number;
  y: number;
  block: string;
  rotation: number;
  original_rotation: number;
  size: number;
  size_offset: number;
  config?: Record<string, unknown> | null;
  original_config?: Record<string, unknown> | null;
  config_types?: Array<{ type: string; content_type?: string }>;
  config_editable?: boolean;
  logic_source_available?: boolean;
  logic_source?: string;
  original_logic_source?: string;
  deleted?: boolean;
};

export type SchematicDocument = { placements: SchematicPlacement[]; quarter_turns: number; mirror_x: boolean };
export type MapTerrainCell = { x: number; y: number; floor: string; overlay: string };
export type MapObjectType = 'core' | 'spawn' | 'building';
export type MapEditorObject = {
  id: string;
  object_type: MapObjectType;
  original_x: number | null;
  original_y: number | null;
  x: number;
  y: number;
  name: string;
  team: string;
  rotation: number;
  size: number;
  size_offset: number;
  rotatable: boolean;
  added: boolean;
  editable: boolean;
  movable: boolean;
  deletable: boolean;
  team_editable: boolean;
  reason: string | null;
};
export type WaveGroup = Record<string, unknown> & { type: string; begin: number; end: number; amount: number; __editor_id?: string };
export type MapDocument = {
  terrain_complete: boolean;
  terrain_edits: Record<string, MapTerrainCell>;
  objects: MapEditorObject[];
  rule_changes: Record<string, unknown>;
  waves: WaveGroup[];
};
export type EditorDocument = SchematicDocument | MapDocument;

export function isSchematicDocument(document: EditorDocument | null | undefined): document is SchematicDocument {
  return Boolean(document && Array.isArray((document as SchematicDocument).placements));
}

export function isMapDocument(document: EditorDocument | null | undefined): document is MapDocument {
  return Boolean(document && !isSchematicDocument(document) && Array.isArray((document as MapDocument).objects));
}

export function editorDocumentKind(document: EditorDocument | null | undefined): 'schematic' | 'map' | null {
  if (isSchematicDocument(document)) return 'schematic';
  if (isMapDocument(document)) return 'map';
  return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function createInitialSchematicDocument(analysis: EditorAnalysis, catalog: EditorContentEntry[]): SchematicDocument {
  const metadata = analysis.renderer_metadata;
  const positions = Array.isArray(metadata.block_positions) ? metadata.block_positions : [];
  const placements: SchematicPlacement[] = positions.flatMap((raw, index) => {
    if (!isRecord(raw) || !Number.isInteger(raw.x) || !Number.isInteger(raw.y) || typeof raw.block !== 'string') return [];
    const entry = catalog.find((item) => item.internal_name === raw.block);
    const configTypes = Array.isArray(raw.config_types) ? raw.config_types.flatMap((value) => {
      if (!isRecord(value) || typeof value.type !== 'string') return [];
      return [{ type: value.type, ...(typeof value.content_type === 'string' ? { content_type: value.content_type } : {}) }];
    }) : [];
    return [{
      id: `source:${raw.x}:${raw.y}:${index}`, source_x: raw.x as number, source_y: raw.y as number,
      x: raw.x as number, y: raw.y as number, block: raw.block,
      rotation: Number.isInteger(raw.rotation) ? Number(raw.rotation) & 3 : 0,
      original_rotation: Number.isInteger(raw.rotation) ? Number(raw.rotation) & 3 : 0,
      size: Number.isInteger(raw.size) ? Math.max(1, Math.min(16, Number(raw.size))) : Math.max(1, entry?.size || 1),
      size_offset: Number.isInteger(raw.size_offset) ? Number(raw.size_offset) : entry?.size_offset ?? -Math.floor(((Number(raw.size) || entry?.size || 1) - 1) / 2),
      config: isRecord(raw.config) ? raw.config : null,
      original_config: isRecord(raw.config) ? JSON.parse(JSON.stringify(raw.config)) as Record<string, unknown> : null,
      config_types: configTypes,
      config_editable: raw.config_editable === true, logic_source_available: raw.logic_source_available === true,
      ...(isRecord(raw.config) && (raw.config.type === 'logic' || raw.config.format_version === 1) && typeof raw.config.source === 'string' ? { logic_source: raw.config.source, original_logic_source: raw.config.source } : {}),
      deleted: false,
    }];
  });
  return { placements, quarter_turns: 0, mirror_x: false };
}

function mapObjectList(value: unknown, objectType: MapObjectType): MapEditorObject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, index) => {
    if (!isRecord(raw) || !Number.isInteger(raw.x) || !Number.isInteger(raw.y)) return [];
    const safe = raw.editable === true;
    const x = raw.x as number; const y = raw.y as number;
    return [{
      id: `source:${objectType}:${x}:${y}:${index}`, object_type: objectType, original_x: x, original_y: y,
      x, y, name: typeof raw.name === 'string' ? raw.name : objectType,
      team: typeof raw.team === 'string' ? raw.team : 'sharded',
      rotation: Number.isInteger(raw.rotation) ? Number(raw.rotation) & 3 : 0,
      size: Number.isInteger(raw.size) ? Math.max(1, Number(raw.size)) : 1, added: false, rotatable: raw.rotatable === true,
      size_offset: Number.isInteger(raw.size_offset) ? Number(raw.size_offset) : -Math.floor(((Number(raw.size) || 1) - 1) / 2),
      editable: safe, movable: raw.movable === true, deletable: raw.deletable === true,
      team_editable: raw.team_editable === true,
      reason: typeof raw.reason === 'string' ? raw.reason : (safe ? null : '该对象包含暂不支持安全编辑的配置。'),
    }];
  });
}

export function createInitialMapDocument(analysis: EditorAnalysis): MapDocument {
  const metadata = analysis.renderer_metadata;
  const layers = isRecord(metadata.tile_layers) ? metadata.tile_layers : {};
  const rawTerrain = Array.isArray(layers.terrain) ? layers.terrain : [];
  const objects = [
    ...mapObjectList(metadata.cores, 'core'),
    ...mapObjectList(layers.enemy_spawns, 'spawn'),
    ...mapObjectList(layers.buildings, 'building'),
  ];
  const rules = isRecord(metadata.rules) ? metadata.rules : {};
  const waves = Array.isArray(rules.spawns) ? rules.spawns.flatMap((raw, index): WaveGroup[] => {
    if (!isRecord(raw) || typeof raw.type !== 'string') return [];
    return [{ ...raw, type: raw.type, begin: finiteNumber(raw.begin, 1), end: finiteNumber(raw.end, 1), amount: finiteNumber(raw.amount, 1), __editor_id: `source-wave:${index}` }];
  }) : [];
  // Preserve every original tile as the read-only base. The draft only stores changed cells.
  const terrainCount = rawTerrain.filter((raw) => isRecord(raw) && Number.isInteger(raw.x) && Number.isInteger(raw.y) && typeof raw.name === 'string').length;
  const expected = Number.isInteger(metadata.width) && Number.isInteger(metadata.height) ? Number(metadata.width) * Number(metadata.height) : 0;
  return { terrain_complete: expected > 0 && terrainCount === expected && metadata.tile_layers_truncated !== true,
    terrain_edits: {}, objects, rule_changes: {}, waves };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export type RuleField = { key: string; label: string; description: string; type: 'boolean' | 'integer' | 'number' | 'text' | 'blocks' | 'units'; default: boolean | number | string | string[]; min?: number; max?: number; advanced?: boolean; unit?: string };

// Kept in sync with MapRenderer.applyRuleChanges; the contract test checks the complete key set.
export const EDITOR_RULE_SCHEMA: RuleField[] = [
  ['allowEditRules', '允许游戏中修改规则', false, '允许玩家在游戏中打开规则编辑器。', true],
  ['infiniteResources', '无限资源', false, '启用沙盒资源、建造范围和建造速度。'],
  ['coreBuildAndConfig', '允许建造与配置核心', false, '允许在地图任意位置放置核心并调整队伍。', true],
  ['waveTimer', '波次计时器', true, '自动按计时器召唤下一波。'],
  ['waveSending', '允许手动召唤下一波', true, '玩家可使用召唤按钮提前开始下一波。'],
  ['waves', '启用波次', false, '是否启用敌方波次。'],
  ['airUseSpawns', '空军从出生点出现', false, '空中单位从敌人出生点生成，而非地图边缘。', true],
  ['wavesSpawnAtCores', '进攻波次从核心生成', true, '进攻地图启用波次时，让敌人从敌方核心生成。', true],
  ['pvp', 'PvP 模式', false, '以玩家队伍对抗为目标。'],
  ['pvpAutoPause', '等待玩家加入', true, 'PvP 房间等待玩家后再继续。', true],
  ['pauseDisabled', '禁止暂停', false, '单人游戏中不允许暂停。', true],
  ['waitEnemies', '清除敌人后再计时', false, '当前波次敌人全部消灭后才继续计时。'],
  ['attackMode', '进攻模式', false, '进攻敌方核心并摧毁它。'],
  ['editor', '地图编辑模式', false, '按地图编辑器规则运行。', true],
  ['derelictRepair', '允许修复废弃建筑', true, '允许玩家点击废弃建筑进行修复。', true],
  ['canGameOver', '允许游戏结束', true, '关闭后由自定义条件控制胜负。', true],
  ['coreCapture', '核心被摧毁后更换队伍', false, '核心被摧毁时改变其所属队伍。', true],
  ['reactorExplosions', '反应堆会爆炸', true, '反应堆爆炸会伤害周围建筑。'],
  ['possessionAllowed', '允许手动控制单位', true, '允许玩家直接控制单位。', true],
  ['schematicsAllowed', '允许使用蓝图', true, '允许玩家放置蓝图。'],
  ['damageExplosions', '爆炸会造成伤害', true, '友方爆炸会伤害并点燃周围建筑。'],
  ['fire', '启用火焰与蔓延', true, '启用火焰和相关环境蔓延效果。'],
  ['randomWaveAI', '敌人随机选择目标', false, '敌人不再只优先攻击核心和发电机。', true],
  ['unitPayloadUpdate', '载荷单位更新', false, '实验性：载荷中的单位也会更新并共享电力。', true],
  ['unitPayloadsExplode', '载荷单位随载具摧毁', false, '载具被摧毁时一并摧毁载荷单位。', true],
  ['unitCapVariable', '单位上限随核心变化', true, '核心会影响队伍单位上限。', true],
  ['hideSpawns', '隐藏敌人出生点', true, '隐藏敌方单位的出生位置。'],
  ['ghostBlocks', '显示待重建建筑', true, '建筑被摧毁后显示重建标记。', true],
  ['showOtherTeamPings', '显示其他队伍标记', true, '显示其他队伍发出的地图标记。', true],
  ['logicUnitControl', '允许逻辑控制单位', true, '逻辑处理器可以控制单位。'],
  ['logicUnitBuild', '允许逻辑建造', true, '逻辑处理器可以安排建造。', true],
  ['logicUnitDeconstruct', '允许逻辑拆除', false, '逻辑处理器可以拆除建筑。', true],
  ['worldProcessorPlayerLink', '世界处理器连接玩家', true, '允许世界处理器连接玩家对象。', true],
  ['allowEditWorldProcessors', '允许编辑世界处理器', false, '允许修改地图中的世界处理器。', true],
  ['disableWorldProcessors', '禁用世界处理器', false, '不运行地图中的世界处理器。', true],
  ['polygonCoreProtection', '核心多边形保护', false, '以多边形区域保护核心。', true],
  ['placeRangeCheck', '检查放置距离', false, '限制玩家在可达范围内放置建筑。', true],
  ['cleanupDeadTeams', '清理已淘汰队伍', true, '清理不再存活的队伍。', true],
  ['onlyDepositCore', '仅允许向核心存放物品', false, '限制物品存入位置。', true],
  ['allowCoreUnloaders', '允许核心卸载器', true, '允许从核心卸载物品。', true],
  ['coreDestroyClear', '核心摧毁后清理队伍', false, '核心摧毁后清除该队伍。', true],
  ['hideBannedBlocks', '隐藏禁用方块', false, '在建造菜单中隐藏禁用方块。', true],
  ['allowEnvironmentDeconstruct', '允许拆除环境方块', false, '允许拆除地图中的环境方块。', true],
  ['instantBuild', '即时建造', false, '建筑无需等待建造时间。', true],
  ['blockWhitelist', '使用方块白名单', false, '仅允许列表中的方块。', true],
  ['unitWhitelist', '使用单位白名单', false, '仅允许列表中的单位。', true],
  ['disableUnitCap', '关闭单位上限', false, '不限制队伍单位数量。', true],
  ['lighting', '启用动态光照', false, '启用地图动态光照效果。', true],
].map(([key, label, value, description, advanced]) => ({ key: String(key), label: String(label), type: 'boolean', default: Boolean(value), description: String(description), advanced: Boolean(advanced) })) as RuleField[];

EDITOR_RULE_SCHEMA.push(
  { key: 'unitCap', label: '单位上限', description: '每个队伍允许拥有的单位数量。', type: 'integer', default: 0, min: 0, max: 1_000_000 },
  { key: 'winWave', label: '胜利波次', description: '到达指定波次后判定胜利。', type: 'integer', default: 0, min: 0, max: 1_000_000 },
  { key: 'environment', label: '环境标记', description: 'Mindustry 环境位标记，通常由地图自动设置。', type: 'integer', default: 0, min: 0, max: 2_147_483_647, advanced: true },
  ...(['solarMultiplier', 'unitBuildSpeedMultiplier', 'unitCostMultiplier', 'unitDamageMultiplier', 'unitHealthMultiplier', 'unitCrashDamageMultiplier', 'unitMineSpeedMultiplier', 'unitFactoryActivationDelay', 'blockHealthMultiplier', 'blockDamageMultiplier', 'buildCostMultiplier', 'buildSpeedMultiplier', 'deconstructRefundMultiplier', 'enemyCoreBuildRadius', 'dropZoneRadius', 'waveSpacing', 'initialWaveSpacing', 'itemDepositCooldown'] as const).map((key) => {
    const defaults: Record<(typeof key), number> = {
      solarMultiplier: 1, unitBuildSpeedMultiplier: 1, unitCostMultiplier: 1, unitDamageMultiplier: 1, unitHealthMultiplier: 1,
      unitCrashDamageMultiplier: 1, unitMineSpeedMultiplier: 1, unitFactoryActivationDelay: 0, blockHealthMultiplier: 1,
      blockDamageMultiplier: 1, buildCostMultiplier: 1, buildSpeedMultiplier: 1, deconstructRefundMultiplier: 0.5,
      enemyCoreBuildRadius: 400, dropZoneRadius: 300, waveSpacing: 7200, initialWaveSpacing: 0, itemDepositCooldown: 0.5,
    };
    const labels: Record<(typeof key), string> = {
      solarMultiplier: '太阳能发电倍率', unitBuildSpeedMultiplier: '单位建造速度倍率', unitCostMultiplier: '单位造价倍率',
      unitDamageMultiplier: '单位伤害倍率', unitHealthMultiplier: '单位生命倍率', unitCrashDamageMultiplier: '单位坠毁伤害倍率',
      unitMineSpeedMultiplier: '单位采矿速度倍率', unitFactoryActivationDelay: '单位工厂启动延迟', blockHealthMultiplier: '建筑生命倍率',
      blockDamageMultiplier: '建筑伤害倍率', buildCostMultiplier: '建造资源消耗倍率', buildSpeedMultiplier: '建造速度倍率',
      deconstructRefundMultiplier: '拆除返还倍率', enemyCoreBuildRadius: '敌方核心建造半径', dropZoneRadius: '敌人出生区半径',
      waveSpacing: '波次间隔', initialWaveSpacing: '首波间隔', itemDepositCooldown: '物品存放冷却',
    };
    const units: Partial<Record<(typeof key), string>> = {
      solarMultiplier: '倍率', unitBuildSpeedMultiplier: '倍率', unitCostMultiplier: '倍率', unitDamageMultiplier: '倍率',
      unitHealthMultiplier: '倍率', unitCrashDamageMultiplier: '倍率', unitMineSpeedMultiplier: '倍率',
      unitFactoryActivationDelay: '秒', blockHealthMultiplier: '倍率', blockDamageMultiplier: '倍率', buildCostMultiplier: '倍率',
      buildSpeedMultiplier: '倍率', deconstructRefundMultiplier: '倍率', enemyCoreBuildRadius: '世界单位', dropZoneRadius: '世界单位',
      waveSpacing: '帧（60帧约1秒）', initialWaveSpacing: '帧（60帧约1秒）', itemDepositCooldown: '秒',
    };
    return { key, label: labels[key], description: '该规则会改变地图的游戏平衡。', type: 'number' as const, default: defaults[key], min: 0, max: 1_000_000_000, advanced: true, unit: units[key] };
  }),
  { key: 'modeName', label: '模式名称', description: '显示给玩家的自定义游戏模式名称。', type: 'text', default: '', advanced: true },
  { key: 'bannedBlocks', label: '禁用方块', description: '选择此地图中不能使用的方块。', type: 'blocks', default: [], advanced: true },
  { key: 'bannedUnits', label: '禁用单位', description: '选择此地图中不能使用的单位。', type: 'units', default: [], advanced: true },
);

export function ruleValue(rules: Record<string, unknown>, key: string, defaults: Record<string, unknown> = {}): unknown {
  const schema = EDITOR_RULE_SCHEMA.find((field) => field.key === key);
  return Object.prototype.hasOwnProperty.call(rules, key) ? rules[key] : Object.prototype.hasOwnProperty.call(defaults, key) ? defaults[key] : schema?.default;
}

export function buildWaveOperations(original: WaveGroup[], edited: WaveGroup[]) {
  const fields = ['type', 'begin', 'end', 'spacing', 'max', 'scaling', 'shields', 'shieldScaling', 'amount', 'spawn', 'effect', 'payloads', 'items', 'team'];
  type Operation = { action: 'add' | 'update' | 'delete' | 'move'; index: number; to_index?: number; fields?: Record<string, unknown> };
  const result: Operation[] = [];
  const id = (group: WaveGroup, index: number, prefix: string) => group.__editor_id || `${prefix}:${index}`;
  const originalIds = original.map((group, index) => id(group, index, 'source-wave'));
  const editedIds = edited.map((group, index) => group.__editor_id || originalIds[index] || `new-wave:${index}`);
  const originalById = new Map(original.map((group, index) => [originalIds[index], group]));
  const liveIds = new Set(editedIds);
  const working = originalIds.map((value) => value);
  for (let index = working.length - 1; index >= 0; index--) {
    if (!liveIds.has(working[index])) {
      result.push({ action: 'delete', index });
      working.splice(index, 1);
    }
  }
  const toFields = (group: WaveGroup) => Object.fromEntries(fields.filter((key) => Object.prototype.hasOwnProperty.call(group, key)).map((key) => [key, group[key]]));
  for (let targetIndex = 0; targetIndex < edited.length; targetIndex++) {
    const group = edited[targetIndex], groupId = editedIds[targetIndex];
    const currentIndex = working.indexOf(groupId);
    if (currentIndex < 0) {
      result.push({ action: 'add', index: targetIndex, fields: toFields(group) });
      working.splice(targetIndex, 0, groupId);
      continue;
    }
    if (currentIndex !== targetIndex) {
      result.push({ action: 'move', index: currentIndex, to_index: targetIndex });
      working.splice(targetIndex, 0, working.splice(currentIndex, 1)[0]);
    }
    const before = originalById.get(groupId);
    if (!before) continue;
    const changes: Record<string, unknown> = {};
    for (const key of fields) {
      if (Object.prototype.hasOwnProperty.call(group, key) && JSON.stringify(group[key]) !== JSON.stringify(before[key])) changes[key] = group[key];
    }
    if (Object.keys(changes).length) result.push({ action: 'update', index: targetIndex, fields: changes });
  }
  return result;
}

export function schematicOperations(document: SchematicDocument) {
  const original = document.placements.filter((placement) => placement.source_x !== null && placement.source_y !== null);
  const additions = document.placements.filter((placement) => placement.source_x === null || placement.source_y === null);
  const deleted = original.filter((placement) => placement.deleted);
  return {
    rotation_quarters: document.quarter_turns,
    mirror_x: document.mirror_x,
    delete_positions: deleted.map((item) => ({ x: item.source_x as number, y: item.source_y as number })),
    move_positions: original.flatMap((item) => !item.deleted && (item.x !== item.source_x || item.y !== item.source_y)
      ? [{ from_x: item.source_x as number, from_y: item.source_y as number, to_x: item.x, to_y: item.y }] : []),
    add_blocks: additions.filter((item) => !item.deleted).map((item) => ({ x: item.x, y: item.y, block: item.block, rotation: item.rotation })),
    rotate_positions: original.flatMap((item) => !item.deleted && item.rotation !== item.original_rotation
      ? [{ x: item.source_x as number, y: item.source_y as number, rotation_quarters: (item.rotation - item.original_rotation + 4) & 3 }] : []),
    logic_configs: original.flatMap((item) => !item.deleted && item.logic_source_available && item.logic_source !== undefined
      && item.logic_source !== item.original_logic_source
      ? [{ x: item.source_x as number, y: item.source_y as number, source: item.logic_source }] : []),
    config_edits: original.flatMap((item) => !item.deleted && item.config_editable && item.config && item.config.type !== 'logic'
      && JSON.stringify(item.config) !== JSON.stringify(item.original_config)
      ? [{ x: item.source_x as number, y: item.source_y as number, config: item.config }] : []),
  };
}

export function mapObjectOperations(original: MapEditorObject[], edited: MapEditorObject[]) {
  const operations: Array<Record<string, unknown>> = [];
  const live = new Map(edited.filter((item) => !item.added).map((item) => [item.id, item]));
  for (const item of original) {
    const current = live.get(item.id);
    if (!current) {
      operations.push({ action: 'delete', object_type: item.object_type, x: item.original_x, y: item.original_y });
      continue;
    }
    if (current.x !== item.original_x || current.y !== item.original_y) operations.push({ action: 'move', object_type: item.object_type, from_x: item.original_x, from_y: item.original_y, to_x: current.x, to_y: current.y });
    if (item.object_type !== 'spawn' && current.team !== item.team) operations.push({ action: 'team', object_type: item.object_type, x: item.original_x, y: item.original_y, team: current.team });
    if (item.object_type !== 'spawn' && current.rotation !== item.rotation) operations.push({ action: 'rotate', object_type: item.object_type, x: item.original_x, y: item.original_y, rotation: current.rotation });
  }
  for (const item of edited.filter((entry) => entry.added)) operations.push({ action: 'add', object_type: item.object_type, x: item.x, y: item.y, name: item.name, ...(item.object_type !== 'spawn' ? { team: item.team } : {}), rotation: item.rotation });
  return operations;
}

export function validateObjectPosition(object: Pick<MapEditorObject, 'x' | 'y' | 'size'> & Partial<Pick<MapEditorObject, 'size_offset'>>, width: number, height: number, others: Array<Pick<MapEditorObject, 'x' | 'y' | 'size'> & Partial<Pick<MapEditorObject, 'size_offset'>>>): string | null {
  if (!Number.isInteger(object.x) || !Number.isInteger(object.y)) return '坐标必须是整数。';
  const offset = object.size_offset ?? -Math.floor((object.size - 1) / 2);
  const left = object.x + offset; const bottom = object.y + offset;
  if (left < 0 || bottom < 0 || left + object.size > width || bottom + object.size > height) return '建筑占地超出地图边界。';
  for (const other of others) {
    const otherOffset = other.size_offset ?? -Math.floor((other.size - 1) / 2);
    const otherLeft = other.x + otherOffset; const otherBottom = other.y + otherOffset;
    if (left < otherLeft + other.size && left + object.size > otherLeft && bottom < otherBottom + other.size && bottom + object.size > otherBottom) return '建筑占地与其他对象重叠。';
  }
  return null;
}

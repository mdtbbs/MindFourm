import {
  AnalyzerWarning,
  boundedNumber,
  boundedString,
  list,
  parseRendererMetadata,
  record,
  uniqueWarnings,
  warning,
} from './renderer-metadata.util';

export const SCHEMATIC_ANALYZER_VERSION = 'mdtbbs-schematic-metadata-1';

export type SchematicBlockRecord = {
  internal_name: string;
  display_name: string | null;
  count: number;
  positions_json: unknown[] | null;
  properties_json: Record<string, unknown> | null;
};

export type SchematicMaterialRecord = { internal_name: string; amount: number };
export type SchematicLogicProcessorRecord = {
  position_x: number | null;
  position_y: number | null;
  processor_type: string | null;
  links_json: unknown[] | null;
  variables_json: Record<string, unknown> | null;
};

export type SchematicAnalysisRecord = {
  parser_version: string;
  status: 'completed' | 'partial';
  complete: boolean;
  available: boolean;
  estimated: true;
  production_json: Record<string, unknown> | null;
  bottlenecks_json: Array<Record<string, unknown>>;
  warnings_json: AnalyzerWarning[];
};

export type SchematicAnalyzerResult = {
  parser_version: string;
  metadata: {
    width: number | null;
    height: number | null;
    block_count: number | null;
    content_hash: string | null;
    structure_hash: string | null;
    normalized_structure_hash: string | null;
    min_supported_build: number | null;
    schematic_format_version: number | null;
    parser_version: string;
    dependencies_json: string[];
    source_renderer_metadata_json: Record<string, unknown>;
    source_metadata_json: Record<string, unknown> | null;
  };
  blocks: SchematicBlockRecord[];
  materials: SchematicMaterialRecord[];
  logic_processors: SchematicLogicProcessorRecord[];
  analysis: SchematicAnalysisRecord;
};

/** Normalizes the renderer's existing schematic metadata without running a game simulation. */
export function analyzeSchematicMetadata(rendererInput: unknown, publisherInput?: unknown): SchematicAnalyzerResult {
  const parsedRenderer = parseRendererMetadata(rendererInput);
  const parsedPublisher = publisherInput === undefined ? null : parseRendererMetadata(publisherInput);
  const renderer = parsedRenderer.value;
  const publisher = parsedPublisher?.value ?? {};
  const warnings: AnalyzerWarning[] = [...parsedRenderer.warnings, ...(parsedPublisher?.warnings ?? [])];

  const { blocks, logicProcessors } = normalizeBlocks(renderer, warnings);
  const materials = normalizeMaterials(renderer.requirements ?? publisher.requirements, warnings);
  const compatibility = record(renderer.compatibility);
  const dependencies = normalizeStringList(renderer.mod_dependencies ?? publisher.required_mods ?? publisher.dependencies, warnings, 'DEPENDENCIES_TRUNCATED');
  const production = normalizeProduction(renderer.production, warnings);
  const bottlenecks = production ? findBottlenecks(production) : [];
  const complete = production?.complete === true;
  const available = production?.available === true;
  if (renderer.block_positions_truncated === true) warnings.push(warning('BLOCK_POSITIONS_TRUNCATED', 'The renderer omitted some block positions; positional details are partial.'));
  if (!production) warnings.push(warning('PRODUCTION_ANALYSIS_UNAVAILABLE', 'No renderer production flow summary was available.'));
  if (production && production.complete !== true) warnings.push(warning('PRODUCTION_ANALYSIS_INCOMPLETE', 'The renderer marked production rates incomplete; the result is a theoretical estimate.'));
  if (production && production.available !== true) warnings.push(warning('PRODUCTION_NOT_AVAILABLE', 'The schematic has no renderer-identified production facility.'));

  return {
    parser_version: SCHEMATIC_ANALYZER_VERSION,
    metadata: {
      width: boundedNumber(renderer.width, { min: 0, max: 100_000, integer: true }),
      height: boundedNumber(renderer.height, { min: 0, max: 100_000, integer: true }),
      block_count: boundedNumber(renderer.block_count ?? renderer.blocks ?? sumCounts(blocks), { min: 0, max: 10_000_000, integer: true }),
      content_hash: boundedString(renderer.content_hash, 64),
      structure_hash: boundedString(renderer.structure_hash, 64),
      normalized_structure_hash: boundedString(renderer.normalized_structure_hash, 64),
      min_supported_build: boundedNumber(compatibility.minimum_supported_build, { min: 0, max: 1_000_000, integer: true }),
      schematic_format_version: boundedNumber(renderer.schematic_format_version, { min: 0, max: 255, integer: true }),
      parser_version: SCHEMATIC_ANALYZER_VERSION,
      dependencies_json: dependencies,
      source_renderer_metadata_json: renderer,
      source_metadata_json: parsedPublisher ? publisher : null,
    },
    blocks,
    materials,
    logic_processors: logicProcessors,
    analysis: {
      parser_version: SCHEMATIC_ANALYZER_VERSION,
      status: production && complete ? 'completed' : 'partial',
      complete,
      available,
      estimated: true,
      production_json: production,
      bottlenecks_json: bottlenecks,
      warnings_json: uniqueWarnings(warnings),
    },
  };
}

function normalizeBlocks(renderer: Record<string, unknown>, warnings: AnalyzerWarning[]): { blocks: SchematicBlockRecord[]; logicProcessors: SchematicLogicProcessorRecord[] } {
  const counts = new Map<string, number>();
  const declaredTypes = new Set<string>();
  const positions = new Map<string, unknown[]>();
  const sourceTypes = list(renderer.block_types);
  if (sourceTypes.truncated) warnings.push(warning('BLOCK_TYPES_TRUNCATED', 'The renderer block type list exceeded the analysis limit.'));
  for (const raw of sourceTypes.values) {
    const item = record(raw);
    const name = blockName(item.name ?? item.id ?? item.internal_name);
    if (!name) continue;
    const count = boundedNumber(item.count, { min: 0, max: 10_000_000, integer: true });
    if (count !== null) {
      declaredTypes.add(name);
      counts.set(name, (counts.get(name) ?? 0) + count);
    }
  }

  const processorMap = new Map<string, SchematicLogicProcessorRecord>();
  const sourcePositions = list(renderer.block_positions);
  if (sourcePositions.truncated) warnings.push(warning('BLOCK_POSITIONS_TRUNCATED', 'The renderer block position list exceeded the analysis limit.'));
  for (const raw of sourcePositions.values) {
    const item = record(raw);
    const name = blockName(item.block ?? item.name ?? item.internal_name);
    if (!name) continue;
    if (!declaredTypes.has(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
    const schematicConfig = normalizeSchematicConfig(item.config);
    const logicConfig = normalizeLogicConfig(item.config);
    const configTypes = normalizeConfigTypes(item.config_types);
    const position = {
      x: boundedNumber(item.x, { min: -1_000_000, max: 1_000_000, integer: true }),
      y: boundedNumber(item.y, { min: -1_000_000, max: 1_000_000, integer: true }),
      rotation: boundedNumber(item.rotation, { min: 0, max: 3, integer: true }),
      size: boundedNumber(item.size, { min: 1, max: 64, integer: true }) ?? 1,
      ...(schematicConfig ? { config: schematicConfig } : {}),
      ...(configTypes.length ? { config_types: configTypes } : {}),
      ...(item.config_editable === true && (schematicConfig !== null || item.config == null) ? { config_editable: true } : {}),
      ...(name.includes('processor') && logicConfig
        ? { config: logicConfig, logic_source_available: true }
        : name.includes('processor') ? { logic_source_available: item.logic_source_available === true } : {}),
    };
    const entries = positions.get(name) ?? [];
    if (entries.length < 500) entries.push(position);
    positions.set(name, entries);

    if (/(?:processor|logic-display|display-logic|logic-message)/.test(name)) {
      const processorKey = `${position.x ?? ''}:${position.y ?? ''}:${name}`;
      if (!processorMap.has(processorKey)) {
        processorMap.set(processorKey, {
          position_x: position.x,
          position_y: position.y,
          processor_type: name.slice(0, 64),
          links_json: logicConfig?.links ?? null,
          variables_json: null,
        });
      }
    }
  }
  if (sourcePositions.values.length > 0 && sourceTypes.values.length === 0) {
    warnings.push(warning('BLOCK_COUNTS_DERIVED', 'Block counts were derived from the bounded renderer position list.'));
  }
  if (processorMap.size > 0) warnings.push(warning('LOGIC_NOT_EXECUTED', 'Processor source and links are exposed as inert metadata; the source is not evaluated or interpreted.', 'info'));

  const blocks = [...counts.entries()].slice(0, 500).map(([internal_name, count]) => ({
    internal_name,
    display_name: null,
    count,
    positions_json: positions.get(internal_name) ?? null,
    properties_json: null,
  })).sort((left, right) => left.internal_name.localeCompare(right.internal_name));
  if (counts.size > 500) warnings.push(warning('BLOCK_TYPES_TRUNCATED', 'The number of distinct block types exceeded the analysis limit.'));
  return { blocks, logicProcessors: [...processorMap.values()].slice(0, 500) };
}

function normalizeLogicConfig(value: unknown): { type: 'logic'; source: string; links: Array<{ name: string; x: number; y: number }>; format_version: 1 } | null {
  const config = record(value);
  if (config.format_version !== 1 || (config.type !== undefined && config.type !== 'logic')) return null;
  const source = boundedString(config.source, 32_768);
  if (source === null || source.includes('\0')) return null;
  const rawLinks = list(config.links, 1_000);
  if (rawLinks.truncated) return null;
  const links: Array<{ name: string; x: number; y: number }> = [];
  for (const raw of rawLinks.values) {
    const link = record(raw);
    const name = boundedString(link.name, 100);
    const x = boundedNumber(link.x, { min: -32_768, max: 32_767, integer: true });
    const y = boundedNumber(link.y, { min: -32_768, max: 32_767, integer: true });
    if (!name || x === null || y === null) return null;
    links.push({ name, x, y });
  }
  return { type: 'logic', source, links, format_version: 1 };
}

const SCHEMATIC_CONFIG_TYPES = new Set([
  'none', 'integer', 'long', 'float', 'double', 'boolean', 'text', 'content', 'tech_node', 'point',
  'point_array', 'int_seq', 'int_array', 'boolean_array', 'vec2', 'vec2_array', 'team', 'l_access',
  'unit_command', 'color', 'logic',
]);

function normalizeSchematicConfig(value: unknown): Record<string, unknown> | null {
  const config = record(value);
  if (config.format_version === 1) return normalizeLogicConfig(config);
  if (typeof config.type !== 'string' || !SCHEMATIC_CONFIG_TYPES.has(config.type)) return null;
  const type = config.type;
  const exact = (keys: string[]) => Object.keys(config).every(key => keys.includes(key)) && keys.every(key => key in config);
  if (type === 'logic') return normalizeLogicConfig(config);
  if (type === 'none' && exact(['type'])) return { type };
  if (['integer', 'float', 'double'].includes(type) && exact(['type', 'value']) && boundedNumber(config.value, { min: -1_000_000_000, max: 1_000_000_000 }) !== null) {
    return { type, value: config.value };
  }
  if (type === 'long' && exact(['type', 'value']) && typeof config.value === 'string' && /^-?(0|[1-9][0-9]{0,18})$/.test(config.value)) return { type, value: config.value };
  if (type === 'color' && exact(['type', 'value']) && typeof config.value === 'string' && /^#[0-9a-fA-F]{8}$/.test(config.value)) return { type, value: config.value };
  if (type === 'boolean' && exact(['type', 'value']) && typeof config.value === 'boolean') return { type, value: config.value };
  if (type === 'text' && exact(['type', 'value']) && typeof config.value === 'string' && config.value.length <= 1200 && !config.value.includes('\0')) return { type, value: config.value };
  if (['content', 'tech_node'].includes(type) && exact(['type', 'content_type', 'name'])
    && typeof config.content_type === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(config.content_type)
    && typeof config.name === 'string' && /^[a-zA-Z0-9_.:-]{1,191}$/.test(config.name)) {
    return { type, content_type: config.content_type, name: config.name };
  }
  if (type === 'point' && exact(['type', 'x', 'y'])
    && boundedNumber(config.x, { min: -127, max: 127, integer: true }) !== null
    && boundedNumber(config.y, { min: -127, max: 127, integer: true }) !== null) return { type, x: config.x, y: config.y };
  if (['point_array', 'vec2_array'].includes(type) && exact(['type', 'points']) && Array.isArray(config.points)
    && config.points.length <= (type === 'point_array' ? 255 : 1000)) {
    const points = config.points.flatMap(raw => {
      const point = record(raw);
      const min = type === 'point_array' ? -127 : 0;
      const max = type === 'point_array' ? 127 : 127;
      const x = boundedNumber(point.x, { min, max, integer: type === 'point_array' });
      const y = boundedNumber(point.y, { min, max, integer: type === 'point_array' });
      return x === null || y === null || Object.keys(point).some(key => !['x', 'y'].includes(key)) ? [] : [{ x, y }];
    });
    return points.length === config.points.length ? { type, points } : null;
  }
  if (['int_seq', 'int_array'].includes(type) && exact(['type', 'values']) && Array.isArray(config.values) && config.values.length <= 1000) {
    const values = config.values.map(value => boundedNumber(value, { min: -16_384, max: 16_383, integer: true }));
    return values.every(value => value !== null) ? { type, values } : null;
  }
  if (type === 'boolean_array' && exact(['type', 'values']) && Array.isArray(config.values)
    && config.values.length <= 1000 && config.values.every(value => typeof value === 'boolean')) return { type, values: config.values };
  if (type === 'vec2' && exact(['type', 'x', 'y'])) {
    const x = boundedNumber(config.x, { min: 0, max: 127 });
    const y = boundedNumber(config.y, { min: 0, max: 127 });
    return x === null || y === null ? null : { type, x, y };
  }
  if (['team', 'l_access', 'unit_command'].includes(type) && exact(['type', 'name'])
    && typeof config.name === 'string' && config.name.length <= 100) return { type, name: config.name };
  return null;
}

function normalizeConfigTypes(value: unknown): Array<{ type: string; content_type?: string }> {
  const source = list(value, 32);
  if (source.truncated) return [];
  return source.values.flatMap(raw => {
    const descriptor = record(raw);
    if (typeof descriptor.type !== 'string' || !SCHEMATIC_CONFIG_TYPES.has(descriptor.type)
      || Object.keys(descriptor).some(key => !['type', 'content_type'].includes(key))) return [];
    if (descriptor.content_type !== undefined && (typeof descriptor.content_type !== 'string' || descriptor.content_type.length > 40)) return [];
    return [{ type: descriptor.type, ...(typeof descriptor.content_type === 'string' ? { content_type: descriptor.content_type } : {}) }];
  });
}

function normalizeMaterials(value: unknown, warnings: AnalyzerWarning[]): SchematicMaterialRecord[] {
  const source = list(value);
  if (source.truncated) warnings.push(warning('MATERIALS_TRUNCATED', 'The material requirements list exceeded the analysis limit.'));
  const amounts = new Map<string, number>();
  for (const raw of source.values) {
    const item = record(raw);
    const name = blockName(item.item ?? item.name ?? item.id ?? item.internal_name);
    const amount = boundedNumber(item.amount ?? item.count, { min: 0, max: 1_000_000_000, integer: true });
    if (!name || amount === null) continue;
    amounts.set(name, Math.min(1_000_000_000, (amounts.get(name) ?? 0) + amount));
  }
  return [...amounts.entries()].map(([internal_name, amount]) => ({ internal_name, amount })).sort((left, right) => left.internal_name.localeCompare(right.internal_name));
}

function normalizeProduction(value: unknown, warnings: AnalyzerWarning[]): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = record(value);
  const productionWarnings = list(source.warnings, 50);
  if (productionWarnings.truncated) warnings.push(warning('PRODUCTION_WARNINGS_TRUNCATED', 'The renderer production warnings exceeded the analysis limit.'));
  const normalizedWarnings = productionWarnings.values.map((raw) => {
    const item = record(raw);
    const code = boundedString(item.type ?? item.code, 64) ?? 'renderer-warning';
    const message = boundedString(item.message, 500) ?? code;
    const blockId = boundedString(item.blockId ?? item.block_id, 191);
    return { code, message, severity: 'warning', ...(blockId ? { block_id: blockId } : {}), ...(boundedNumber(item.count, { min: 0, max: 10_000_000, integer: true }) !== null ? { count: boundedNumber(item.count, { min: 0, max: 10_000_000, integer: true }) } : {}) };
  });
  for (const item of normalizedWarnings) warnings.push(warning(String(item.code), String(item.message)));
  const items = normalizeFlow(source.items);
  const liquids = normalizeFlow(source.liquids);
  const powerSource = record(source.power);
  const generated = boundedNumber(powerSource.generated, { min: 0, max: 1_000_000_000 });
  const consumed = boundedNumber(powerSource.consumed, { min: 0, max: 1_000_000_000 });
  const net = boundedNumber(powerSource.net, { min: -1_000_000_000, max: 1_000_000_000 });
  return {
    mode: 'theoretical',
    estimated: true,
    complete: source.complete === true,
    available: source.available === true,
    items,
    liquids,
    power: { generated, consumed, net: net ?? (generated !== null && consumed !== null ? generated - consumed : null) },
    warnings: normalizedWarnings,
  };
}

function normalizeFlow(value: unknown): Record<string, unknown> {
  const source = record(value);
  const normalizeList = (items: unknown) => list(items, 500).values.map((raw) => {
    const item = record(raw);
    const id = blockName(item.id ?? item.item ?? item.liquid ?? item.name);
    if (!id) return null;
    const result: Record<string, unknown> = {
      id,
      name: boundedString(item.name, 255) ?? id,
      rate: boundedNumber(item.rate, { min: 0, max: 1_000_000_000 }),
    };
    const icon = boundedString(item.icon, 500);
    if (icon) result.icon = icon;
    if (item.estimated === true) result.estimated = true;
    for (const field of ['produced', 'consumed', 'net']) {
      const number = boundedNumber(item[field], { min: -1_000_000_000, max: 1_000_000_000 });
      if (number !== null) result[field] = number;
    }
    return result;
  }).filter((item): item is Record<string, unknown> => item !== null);
  return { inputs: normalizeList(source.inputs), outputs: normalizeList(source.outputs), internal: normalizeList(source.internal) };
}

function findBottlenecks(production: Record<string, unknown>): Array<Record<string, unknown>> {
  const findings: Array<Record<string, unknown>> = [];
  const power = record(production.power);
  const netPower = boundedNumber(power.net, { min: -1_000_000_000, max: 1_000_000_000 });
  if (netPower !== null && netPower < 0) findings.push({ type: 'power-deficit', internal_name: 'power', estimated: true, deficit_per_second: Math.abs(netPower) });
  for (const type of ['items', 'liquids']) {
    const flow = record(production[type]);
    for (const item of list(flow.inputs, 100).values) {
      const row = record(item);
      const id = blockName(row.id);
      const rate = boundedNumber(row.rate, { min: 0, max: 1_000_000_000 });
      if (id && rate !== null && rate > 0) findings.push({ type: 'external-input', resource_type: type === 'items' ? 'item' : 'liquid', internal_name: id, rate, estimated: true });
      if (findings.length >= 100) return findings;
    }
  }
  return findings;
}

function normalizeStringList(value: unknown, warnings: AnalyzerWarning[], code: string): string[] {
  const source = Array.isArray(value) ? list(value) : typeof value === 'string' ? list(value.split(/[\s,]+/)) : { values: [], truncated: false };
  if (source.truncated) warnings.push(warning(code, 'The dependency list exceeded the analysis limit.'));
  return [...new Set(source.values.map(blockName).filter((item): item is string => item !== null))].slice(0, 500);
}

function blockName(value: unknown): string | null {
  const text = boundedString(value, 191);
  return text && /^[A-Za-z0-9_.:-]+$/.test(text) ? text : null;
}

function sumCounts(blocks: SchematicBlockRecord[]): number {
  return blocks.reduce((sum, item) => sum + item.count, 0);
}

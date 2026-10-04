type PlainRecord = Record<string, unknown>;

export type StructuredVersionSnapshot = {
  metadata?: PlainRecord | null;
  analysis?: PlainRecord | null;
  dependencies?: string[];
  blocks?: Array<PlainRecord & { internal_name: string }>;
  materials?: Array<PlainRecord & { internal_name: string }>;
  resources?: Array<PlainRecord & { resource_type: string; internal_name: string }>;
  cores?: Array<PlainRecord>;
  spawns?: Array<PlainRecord>;
  waves?: Array<PlainRecord>;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as PlainRecord).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function diffRecords<T extends PlainRecord>(before: T[], after: T[], keyOf: (row: T) => string) {
  const beforeMap = new Map(before.map(row => [keyOf(row), row]));
  const afterMap = new Map(after.map(row => [keyOf(row), row]));
  const added = [...afterMap].filter(([key]) => !beforeMap.has(key)).map(([, value]) => value);
  const removed = [...beforeMap].filter(([key]) => !afterMap.has(key)).map(([, value]) => value);
  const changed: Array<{ key: string; before: T; after: T }> = [];
  for (const [key, next] of afterMap) {
    const previous = beforeMap.get(key);
    if (previous && canonical(previous) !== canonical(next)) changed.push({ key, before: previous, after: next });
  }
  return { added, removed, changed };
}

function changedFields(before: PlainRecord, after: PlainRecord, fields: string[]) {
  return fields.flatMap(field => canonical(before[field] ?? null) === canonical(after[field] ?? null)
    ? []
    : [{ field, before: before[field] ?? null, after: after[field] ?? null }]);
}

function orderedUnique(values: string[] = []) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function diffStructuredVersion(
  kind: 'schematic' | 'map',
  before: StructuredVersionSnapshot,
  after: StructuredVersionSnapshot,
) {
  const oldMetadata = before.metadata || {};
  const newMetadata = after.metadata || {};
  const dependencies = diffRecords(
    orderedUnique(before.dependencies || []).map(internal_name => ({ internal_name })),
    orderedUnique(after.dependencies || []).map(internal_name => ({ internal_name })),
    row => row.internal_name,
  );
  if (kind === 'schematic') {
    const oldProduction = before.analysis?.production_json ?? null;
    const newProduction = after.analysis?.production_json ?? null;
    const oldPower = (oldProduction && typeof oldProduction === 'object' ? (oldProduction as PlainRecord).power : null) as PlainRecord | null;
    const newPower = (newProduction && typeof newProduction === 'object' ? (newProduction as PlainRecord).power : null) as PlainRecord | null;
    const oldNet = typeof oldPower?.net === 'number' ? oldPower.net : null;
    const newNet = typeof newPower?.net === 'number' ? newPower.net : null;
    return {
      schema_version: 1,
      kind,
      metadata: changedFields(oldMetadata, newMetadata, [
        'width', 'height', 'block_count', 'content_hash', 'structure_hash', 'normalized_structure_hash',
        'min_supported_build', 'schematic_format_version',
      ]),
      blocks: diffRecords(before.blocks || [], after.blocks || [], row => row.internal_name),
      materials: diffRecords(before.materials || [], after.materials || [], row => row.internal_name),
      dependencies,
      production: canonical(oldProduction) === canonical(newProduction) ? null : { before: oldProduction, after: newProduction },
      power_net_delta: oldNet !== null && newNet !== null ? newNet - oldNet : null,
      logic_processor_count: {
        before: Number(before.analysis?.logic_processor_count ?? 0),
        after: Number(after.analysis?.logic_processor_count ?? 0),
      },
      estimated: true,
    };
  }

  const keyCoordinates = (row: PlainRecord) => canonical([
    row.spawn_type ?? null, row.team ?? null, row.x ?? null, row.y ?? null, row.wave ?? null,
    row.core_type ?? null, row.wave_start ?? null, row.wave_end ?? null,
  ]);
  return {
    schema_version: 1,
    kind,
    metadata: changedFields(oldMetadata, newMetadata, [
      'width', 'height', 'game_mode', 'game_modes_json', 'planet', 'player_count', 'playtime_seconds',
      'game_version_min', 'game_version_max', 'rules_json',
    ]),
    resources: diffRecords(before.resources || [], after.resources || [], row => `${row.resource_type}:${row.internal_name}`),
    cores: diffRecords(before.cores || [], after.cores || [], row => keyCoordinates(row)),
    spawns: diffRecords(before.spawns || [], after.spawns || [], row => keyCoordinates(row)),
    waves: diffRecords(before.waves || [], after.waves || [], row => keyCoordinates(row)),
    dependencies,
    analysis: canonical(before.analysis || null) === canonical(after.analysis || null)
      ? null
      : { before: before.analysis || null, after: after.analysis || null, estimated: true },
    estimated: true,
  };
}

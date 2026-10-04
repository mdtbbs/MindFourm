export type PreviewMarker = {
  label: string;
  xPercent: number;
  yPercent: number;
  layer: 'logistics' | 'liquid' | 'power' | 'input_output' | 'terrain' | 'resources' | 'ores' | 'cores' | 'enemy_spawns' | 'buildings' | 'player_area' | 'other';
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Convert renderer tile coordinates to percentages on its preview image. */
export function schematicBlockPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): PreviewMarker | null {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  // Mindustry schematic renders include a one-tile border around the layout.
  return {
    label: `${x}, ${y}`,
    xPercent: ((x + 1.5) / (width + 2)) * 100,
    yPercent: ((height - y + 0.5) / (height + 2)) * 100,
    layer: 'other',
  };
}

export function schematicBlockLayer(block: string): PreviewMarker['layer'] {
  const name = block.toLowerCase();
  if (/(source|void|unloader|mass-driver)/.test(name)) return 'input_output';
  if (/(conduit|liquid|pipe|pump)/.test(name)) return 'liquid';
  if (/(power-node|battery|generator|solar-panel|reactor|turbine|thermal-generator|combustion-generator)/.test(name)) return 'power';
  if (/(conveyor|router|sorter|junction|duct|overflow-gate|underflow-gate|stack-conveyor)/.test(name)) return 'logistics';
  return 'other';
}

export function mapCorePosition(
  x: number,
  y: number,
  width: number,
  height: number,
  label = 'Core',
): PreviewMarker | null {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return {
    label: `${label} (${x}, ${y})`,
    xPercent: (x / width) * 100,
    yPercent: ((height - y) / height) * 100,
    layer: 'cores',
  };
}

export function mapTilePosition(
  x: number,
  y: number,
  width: number,
  height: number,
  name: string,
  layer: Exclude<PreviewMarker['layer'], 'logistics' | 'power' | 'input_output' | 'other'>,
): PreviewMarker | null {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { label: `${name} (${x}, ${y})`, xPercent: (x / width) * 100, yPercent: ((height - y) / height) * 100, layer };
}

type MetadataRecord = Record<string, unknown>;

function record(value: unknown): MetadataRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as MetadataRecord
    : null;
}

function nestedRecord(value: unknown, key: string): MetadataRecord | null {
  return record(record(value)?.[key]);
}

/** Use only coordinates actually supplied by the renderer's public projection. */
export function getPreviewMarkers(
  kind: string,
  metadata: unknown,
  width: number | null | undefined,
  height: number | null | undefined,
): PreviewMarker[] {
  if (!width || !height || width <= 0 || height <= 0) return [];
  const root = record(metadata);
  if (!root) return [];

  if (kind === 'schematic') {
    const schematic = nestedRecord(root, 'schematic') ?? root;
    const positions = schematic.block_positions;
    if (!Array.isArray(positions)) return [];
    return positions.flatMap((raw): PreviewMarker[] => {
      const item = record(raw);
      const x = finiteNumber(item?.x);
      const y = finiteNumber(item?.y);
      if (x === null || y === null) return [];
      const marker = schematicBlockPosition(x, y, width, height);
      if (!marker) return [];
      const block = typeof item?.block === 'string' ? item.block : marker.label;
      return [{ ...marker, layer: schematicBlockLayer(block), label: `${block} (${marker.label})` }];
    });
  }

  if (kind === 'map') {
    const map = nestedRecord(root, 'map') ?? root;
    const markers: PreviewMarker[] = [];
    const cores = Array.isArray(map.cores) ? map.cores : [];
    markers.push(...cores.flatMap((raw): PreviewMarker[] => {
      const item = record(raw);
      const x = finiteNumber(item?.x);
      const y = finiteNumber(item?.y);
      if (x === null || y === null) return [];
      const team = typeof item?.team === 'string' ? item.team : 'Core';
      const marker = mapCorePosition(x, y, width, height, team);
      return marker ? [marker] : [];
    }));
    const layers = nestedRecord(map, 'tile_layers');
    const mapLayerKeys = ['terrain', 'resources', 'ores', 'enemy_spawns', 'buildings', 'player_area', 'liquid'] as const;
    for (const layer of mapLayerKeys) {
      const values = layers?.[layer];
      if (!Array.isArray(values)) continue;
      markers.push(...values.flatMap((raw): PreviewMarker[] => {
        const item = record(raw);
        const x = finiteNumber(item?.x);
        const y = finiteNumber(item?.y);
        if (x === null || y === null) return [];
        const name = typeof item?.name === 'string' ? item.name : layer;
        const marker = mapTilePosition(x, y, width, height, name, layer);
        return marker ? [marker] : [];
      }));
    }
    return markers;
  }

  return [];
}

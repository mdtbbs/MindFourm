export type PreviewMarker = {
  label: string;
  xPercent: number;
  yPercent: number;
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
  };
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
  };
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
      return [{ ...marker, label: `${block} (${marker.label})` }];
    });
  }

  if (kind === 'map') {
    const map = nestedRecord(root, 'map') ?? root;
    const cores = map.cores;
    if (!Array.isArray(cores)) return [];
    return cores.flatMap((raw): PreviewMarker[] => {
      const item = record(raw);
      const x = finiteNumber(item?.x);
      const y = finiteNumber(item?.y);
      if (x === null || y === null) return [];
      const team = typeof item?.team === 'string' ? item.team : 'Core';
      const marker = mapCorePosition(x, y, width, height, team);
      return marker ? [marker] : [];
    });
  }

  return [];
}

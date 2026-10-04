export type RendererReleaseFactKey =
  | 'name'
  | 'author'
  | 'dimensions'
  | 'build'
  | 'spawns'
  | 'block_count'
  | 'core_count'
  | 'planet'
  | 'game_modes';

export type RendererReleaseFact = { key: RendererReleaseFactKey; value: string };

function scalar(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
}

/** Project a small, user-facing subset of renderer metadata; never dump parser payloads. */
export function getRendererReleaseFacts(metadata: Record<string, unknown> | null): RendererReleaseFact[] {
  if (!metadata) return [];
  const facts: RendererReleaseFact[] = [];
  const width = typeof metadata.width === 'number' && Number.isFinite(metadata.width) ? metadata.width : null;
  const height = typeof metadata.height === 'number' && Number.isFinite(metadata.height) ? metadata.height : null;
  if (width !== null && height !== null) facts.push({ key: 'dimensions', value: `${width} × ${height}` });

  const scalarKeys = ['name', 'author', 'build', 'spawns', 'block_count', 'core_count', 'planet'] as const;
  for (const key of scalarKeys) {
    const value = scalar(metadata[key]);
    if (value !== null) facts.push({ key, value });
  }

  const gameModes = metadata.game_modes;
  if (Array.isArray(gameModes)) {
    const values = gameModes.map(scalar);
    if (values.length > 0 && values.every((value): value is string => value !== null)) {
      facts.push({ key: 'game_modes', value: values.join(', ') });
    }
  }
  return facts;
}

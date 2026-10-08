export type WaveGroup = Record<string, unknown>;

// Mindustry v160.5 SpawnGroup.getSpawned uses zero-based waves and scaling as
// waves per additional unit (not a multiplier or an amount per wave).
export function spawnedAt(group: WaveGroup, waveNumber: number): number {
  const wave = waveNumber - 1;
  const begin = Number(group.begin ?? 0), end = Number(group.end ?? 2_147_483_647);
  const spacing = Math.max(1, Number(group.spacing ?? 1));
  if (wave < begin || wave > end || (wave - begin) % spacing !== 0) return 0;
  const scaling = Number(group.scaling ?? 2_147_483_647);
  const amount = Number(group.amount ?? 1);
  const growth = scaling === 0 ? 2_147_483_647 : Math.trunc(Math.trunc((wave - begin) / spacing) / scaling);
  return Math.max(0, Math.min(Number(group.max ?? 40), amount + growth));
}

/**
 * Wave presets. The id is stable and language-neutral; the display name is a
 * locale key resolved by the editor, so the labels follow the visitor and the
 * preset identity does not change with the interface language.
 */
export const WAVE_TEMPLATES: Record<string, WaveGroup[]> = {
  easy: [{ type: 'dagger', begin: 0, end: 49, spacing: 1, amount: 2, scaling: 3, max: 20 }],
  normal: [{ type: 'dagger', begin: 0, end: 49, spacing: 1, amount: 3, scaling: 2, max: 30 }, { type: 'mace', begin: 9, end: 99, spacing: 3, amount: 1, scaling: 4, max: 12 }],
  hard: [{ type: 'fortress', begin: 0, end: 99, spacing: 1, amount: 4, scaling: 2, max: 30 }, { type: 'zenith', begin: 4, end: 99, spacing: 2, amount: 2, scaling: 3, max: 20 }],
  air: [{ type: 'flare', begin: 0, end: 49, spacing: 1, amount: 3, scaling: 2, max: 25 }, { type: 'horizon', begin: 9, end: 99, spacing: 3, amount: 1, scaling: 3, max: 12 }],
  boss: [{ type: 'scepter', begin: 19, end: 99, spacing: 20, amount: 1, scaling: 10, max: 3, effect: 'boss', shields: 500 }],
  erekir: [{ type: 'stell', begin: 0, end: 49, spacing: 1, amount: 2, scaling: 3, max: 20 }, { type: 'elude', begin: 9, end: 99, spacing: 3, amount: 1, scaling: 4, max: 10 }],
};

/** Locale keys for the preset selector, in display order. */
export const WAVE_TEMPLATE_KEYS: Array<{ id: string; labelKey: string }> = [
  { id: 'easy', labelKey: 'editor.templateEasy' },
  { id: 'normal', labelKey: 'editor.templateNormal' },
  { id: 'hard', labelKey: 'editor.templateHard' },
  { id: 'air', labelKey: 'editor.templateAir' },
  { id: 'boss', labelKey: 'editor.templateBoss' },
  { id: 'erekir', labelKey: 'editor.templateErekir' },
];

export function payloadRows(value: unknown): Array<{ type: string; amount: number }> {
  if (!Array.isArray(value)) return [];
  const counts = new Map<string, number>();
  for (const item of value) if (typeof item === 'string') counts.set(item, (counts.get(item) || 0) + 1);
  return [...counts].map(([type, amount]) => ({ type, amount }));
}
export function payloadValues(rows: Array<{ type: string; amount: number }>): string[] {
  return rows.flatMap(row => Array.from({ length: Math.max(0, Math.min(100, Math.trunc(row.amount))) }, () => row.type)).slice(0, 100);
}

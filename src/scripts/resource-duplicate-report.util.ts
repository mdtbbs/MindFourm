export type ResourceFingerprintRow = {
  id: number;
  resource_id?: number;
  public_id: string;
  title: string;
  status: string;
  content_hash: string | null;
  structure_hash: string | null;
  normalized_structure_hash: string | null;
};

export type DuplicateGroup = {
  fingerprint: string;
  resource_ids: number[];
  public_ids: string[];
  titles: string[];
  statuses: string[];
};

export function groupResourceFingerprints(
  rows: ResourceFingerprintRow[],
  field: 'content_hash' | 'structure_hash' | 'normalized_structure_hash',
): DuplicateGroup[] {
  const groups = new Map<string, ResourceFingerprintRow[]>();
  for (const row of rows) {
    const fingerprint = row[field];
    if (!fingerprint) continue;
    const items = groups.get(fingerprint) || [];
    items.push(row);
    groups.set(fingerprint, items);
  }
  return [...groups.entries()]
    .map(([fingerprint, items]) => [fingerprint, [...new Map(items.map((item) => [Number(item.resource_id ?? item.id), item])).values()]] as const)
    .filter(([, items]) => items.length > 1)
    .map(([fingerprint, items]) => ({
      fingerprint,
      resource_ids: items.map((item) => Number(item.resource_id ?? item.id)),
      public_ids: items.map((item) => item.public_id),
      titles: items.map((item) => item.title),
      statuses: items.map((item) => item.status),
    }))
    .sort((left, right) => right.resource_ids.length - left.resource_ids.length || left.fingerprint.localeCompare(right.fingerprint));
}

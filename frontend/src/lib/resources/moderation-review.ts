export type MetadataRecord = Record<string, unknown>;

export interface ResourceModerationReviewInput {
  metadata?: unknown;
  renderer_metadata?: unknown;
}

function asRecord(value: unknown): MetadataRecord {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as MetadataRecord
    : {};
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value as MetadataRecord).length > 0;
  return true;
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as MetadataRecord).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableValue(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function mergeRecords(authorInput: MetadataRecord, parsedResult: MetadataRecord): MetadataRecord {
  const result: MetadataRecord = {};
  const keys = new Set([...Object.keys(authorInput), ...Object.keys(parsedResult)]);
  for (const key of keys) {
    const authorValue = authorInput[key];
    const parsedValue = parsedResult[key];
    const authorIsRecord = authorValue !== null && typeof authorValue === 'object' && !Array.isArray(authorValue);
    const parsedIsRecord = parsedValue !== null && typeof parsedValue === 'object' && !Array.isArray(parsedValue);

    if (authorIsRecord || parsedIsRecord) {
      result[key] = mergeRecords(
        authorIsRecord ? authorValue as MetadataRecord : {},
        parsedIsRecord ? parsedValue as MetadataRecord : {},
      );
    } else if (hasValue(authorValue)) {
      result[key] = hasValue(authorValue) ? authorValue : parsedValue;
    } else if (hasValue(parsedValue)) {
      result[key] = parsedValue;
    }
  }
  return result;
}

function leafValues(record: MetadataRecord, prefix = ''): Map<string, unknown> {
  const leaves = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!hasValue(value)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [nestedPath, nestedValue] of leafValues(value as MetadataRecord, path)) leaves.set(nestedPath, nestedValue);
    } else {
      leaves.set(path, value);
    }
  }
  return leaves;
}

export interface MetadataDifference {
  path: string;
  authorValue: unknown;
  parsedValue: unknown;
}

/** Compares only fields supplied by both sources, ignoring absent and empty values. */
export function resourceMetadataDifferences(input: ResourceModerationReviewInput): MetadataDifference[] {
  const author = leafValues(asRecord(input.metadata));
  const parsed = leafValues(asRecord(input.renderer_metadata));
  return [...author.entries()]
    .filter(([path, value]) => parsed.has(path) && stableValue(value) !== stableValue(parsed.get(path)))
    .map(([path, authorValue]) => ({ path, authorValue, parsedValue: parsed.get(path) }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function effectiveResourceMetadata(input: ResourceModerationReviewInput): MetadataRecord {
  return mergeRecords(asRecord(input.metadata), asRecord(input.renderer_metadata));
}

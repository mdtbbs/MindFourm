export const RENDERER_ANALYZER_LIMITS = {
  maxJsonChars: 1_000_000,
  maxListItems: 500,
  maxObjectKeys: 100,
  maxDepth: 6,
  maxJsonNodes: 8_000,
  maxStringChars: 4_000,
  maxFindings: 50,
} as const;

export type AnalyzerWarning = {
  code: string;
  severity: 'info' | 'warning';
  message: string;
};

export type ParsedMetadata = {
  value: Record<string, unknown>;
  warnings: AnalyzerWarning[];
};

/** Safely accepts TypeORM JSON values or their serialized representation. */
export function parseRendererMetadata(input: unknown): ParsedMetadata {
  const warnings: AnalyzerWarning[] = [];
  let value = input;
  if (typeof value === 'string') {
    if (value.length > RENDERER_ANALYZER_LIMITS.maxJsonChars) {
      warnings.push(warning('INPUT_TOO_LARGE', 'Renderer metadata exceeded the analysis size limit.'));
      return { value: {}, warnings };
    }
    try {
      value = JSON.parse(value);
    } catch {
      warnings.push(warning('MALFORMED_METADATA_JSON', 'Renderer metadata was not valid JSON.'));
      return { value: {}, warnings };
    }
  }
  if (!isRecord(value)) {
    if (value !== null && value !== undefined) warnings.push(warning('INVALID_METADATA_SHAPE', 'Renderer metadata must be an object.'));
    return { value: {}, warnings };
  }
  if (isOverBounded(value)) warnings.push(warning('METADATA_TRUNCATED', 'Renderer metadata exceeded one or more analysis limits and was truncated.'));
  return { value: boundedJson(value) as Record<string, unknown>, warnings };
}

export function warning(code: string, message: string, severity: AnalyzerWarning['severity'] = 'warning'): AnalyzerWarning {
  return { code, severity, message };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function list(value: unknown, cap: number = RENDERER_ANALYZER_LIMITS.maxListItems): { values: unknown[]; truncated: boolean } {
  if (!Array.isArray(value)) return { values: [], truncated: false };
  return { values: value.slice(0, cap), truncated: value.length > cap };
}

export function boundedString(value: unknown, max = 255): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function boundedNumber(value: unknown, options: { min?: number; max?: number; integer?: boolean } = {}): number | null {
  const parsed = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(parsed)) return null;
  const clamped = Math.max(options.min ?? -1_000_000_000, Math.min(options.max ?? 1_000_000_000, parsed));
  return options.integer ? Math.trunc(clamped) : clamped;
}

/** Copies JSON-shaped values with strict node, string, key, array, and depth caps. */
export function boundedJson(value: unknown): unknown {
  const state = { nodes: 0, seen: new WeakSet<object>() };
  return copyJson(value, 0, state);
}

export function boundedArray(value: unknown, maxItems = RENDERER_ANALYZER_LIMITS.maxListItems): unknown[] {
  const parsed = list(value, maxItems).values;
  return parsed.map((item) => boundedJson(item));
}

export function uniqueWarnings(warnings: readonly AnalyzerWarning[]): AnalyzerWarning[] {
  const output: AnalyzerWarning[] = [];
  const seen = new Set<string>();
  for (const item of warnings) {
    const key = `${item.code}\0${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= RENDERER_ANALYZER_LIMITS.maxFindings) break;
  }
  return output;
}

function copyJson(value: unknown, depth: number, state: { nodes: number; seen: WeakSet<object> }): unknown {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.slice(0, RENDERER_ANALYZER_LIMITS.maxStringChars);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (!value || typeof value !== 'object') return null;
  if (depth >= RENDERER_ANALYZER_LIMITS.maxDepth || state.nodes >= RENDERER_ANALYZER_LIMITS.maxJsonNodes) return null;
  if (state.seen.has(value)) return null;
  state.seen.add(value);
  state.nodes += 1;

  if (Array.isArray(value)) {
    return value.slice(0, RENDERER_ANALYZER_LIMITS.maxListItems)
      .map((item) => copyJson(item, depth + 1, state));
  }

  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  let keysSeen = 0;
  for (const key in value as Record<string, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (keysSeen >= RENDERER_ANALYZER_LIMITS.maxObjectKeys || state.nodes >= RENDERER_ANALYZER_LIMITS.maxJsonNodes) break;
    keysSeen += 1;
    output[key.slice(0, 128)] = copyJson((value as Record<string, unknown>)[key], depth + 1, state);
  }
  return output;
}

function isOverBounded(value: unknown): boolean {
  const seen = new WeakSet<object>();
  let nodes = 0;
  const visit = (current: unknown, depth: number): boolean => {
    if (typeof current === 'string') return current.length > RENDERER_ANALYZER_LIMITS.maxStringChars;
    if (!current || typeof current !== 'object') return false;
    if (depth >= RENDERER_ANALYZER_LIMITS.maxDepth || nodes >= RENDERER_ANALYZER_LIMITS.maxJsonNodes || seen.has(current)) return true;
    seen.add(current);
    nodes += 1;
    if (Array.isArray(current)) {
      if (current.length > RENDERER_ANALYZER_LIMITS.maxListItems) return true;
      for (const item of current) if (visit(item, depth + 1)) return true;
      return false;
    }
    const entries = Object.entries(current as Record<string, unknown>);
    if (entries.length > RENDERER_ANALYZER_LIMITS.maxObjectKeys) return true;
    for (const [key, item] of entries) {
      if (key.length > 128 || visit(item, depth + 1)) return true;
    }
    return false;
  };
  return visit(value, 0);
}

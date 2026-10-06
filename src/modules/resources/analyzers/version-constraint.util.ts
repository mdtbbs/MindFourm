export type ResourceVersionMode = 'semver' | 'compatibility';

type ParsedVersion = { parts: number[]; prerelease: string[]; original: string };

function parseComparableVersion(input: string): ParsedVersion | null {
  const value = String(input || '').trim();
  const match = /^v?(\d+(?:\.\d+){0,7})(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value);
  if (!match) return null;
  const parts = match[1].split('.').map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) return null;
  return { parts, prerelease: match[2] ? match[2].split('.') : [], original: value };
}

export function validateResourceVersion(value: string, mode: ResourceVersionMode): string {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 50) throw new Error('Version must contain 1 to 50 characters');
  if (mode === 'semver') {
    // SemVer 2.0 core and prerelease rules; build metadata is accepted but ignored for precedence.
    const strict = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(normalized);
    if (!strict) throw new Error('SemVer versions must follow MAJOR.MINOR.PATCH');
  } else if (!/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,49}$/.test(normalized)) {
    throw new Error('Compatibility versions may contain letters, digits, dot, plus, underscore, and hyphen');
  }
  return normalized;
}

export function compareResourceVersions(left: string, right: string): number {
  const a = parseComparableVersion(left);
  const b = parseComparableVersion(right);
  if (!a || !b) return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
  const length = Math.max(a.parts.length, b.parts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a.parts[index] || 0) - (b.parts[index] || 0);
    if (difference) return Math.sign(difference);
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length ? -1 : 1;
  }
  const prereleaseLength = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < prereleaseLength; index += 1) {
    const av = a.prerelease[index]; const bv = b.prerelease[index];
    if (av === undefined || bv === undefined) return av === bv ? 0 : av === undefined ? -1 : 1;
    if (av === bv) continue;
    const an = /^(0|[1-9]\d*)$/.test(av); const bn = /^(0|[1-9]\d*)$/.test(bv);
    if (an && bn) return Math.sign(Number(av) - Number(bv));
    if (an !== bn) return an ? -1 : 1;
    return av.localeCompare(bv);
  }
  return 0;
}

type Comparator = { operator: '>=' | '>' | '<=' | '<' | '=' | '^' | '~'; version: string };

function parseRangeGroup(group: string): Comparator[] | null {
  const trimmed = group.trim();
  if (!trimmed || trimmed === '*' || trimmed.toLowerCase() === 'x') return [];
  const hyphen = /^([^\s]+)\s+-\s+([^\s]+)$/.exec(trimmed);
  if (hyphen) return [{ operator: '>=', version: hyphen[1] }, { operator: '<=', version: hyphen[2] }];
  const tokens = trimmed.split(/\s+/);
  const result: Comparator[] = [];
  for (const token of tokens) {
    const match = /^(>=|<=|>|<|=|\^|~)?(v?\d+(?:\.\d+){0,7}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(token);
    if (!match) return null;
    result.push({ operator: (match[1] || '=') as Comparator['operator'], version: match[2] });
  }
  return result;
}

function matchesComparator(actual: string, comparator: Comparator): boolean {
  const comparison = compareResourceVersions(actual, comparator.version);
  switch (comparator.operator) {
    case '>': return comparison > 0;
    case '>=': return comparison >= 0;
    case '<': return comparison < 0;
    case '<=': return comparison <= 0;
    case '=': return comparison === 0;
    case '^': {
      const base = parseComparableVersion(comparator.version);
      const value = parseComparableVersion(actual);
      if (!base || !value || comparison < 0) return false;
      const upper = [...base.parts];
      const pivot = upper.findIndex((part) => part !== 0);
      const index = pivot < 0 ? upper.length - 1 : pivot;
      upper[index] = (upper[index] || 0) + 1;
      for (let cursor = index + 1; cursor < upper.length; cursor += 1) upper[cursor] = 0;
      return compareResourceVersions(actual, upper.join('.')) < 0;
    }
    case '~': {
      const base = parseComparableVersion(comparator.version);
      if (!base || comparison < 0) return false;
      const upper = [...base.parts];
      const index = upper.length === 1 ? 0 : 1;
      upper[index] = (upper[index] || 0) + 1;
      for (let cursor = index + 1; cursor < upper.length; cursor += 1) upper[cursor] = 0;
      return compareResourceVersions(actual, upper.join('.')) < 0;
    }
  }
}

/** Supports exact versions, whitespace AND ranges, `||`, caret/tilde, and hyphen ranges. */
export function satisfiesVersionRange(version: string, range: string | null | undefined): boolean {
  const constraint = String(range || '').trim();
  if (!constraint || constraint === '*' || constraint.toLowerCase() === 'x') return true;
  if (constraint.length > 160) return false;
  return constraint.split('||').some((group) => {
    const comparators = parseRangeGroup(group);
    return comparators !== null && comparators.every((item) => matchesComparator(version, item));
  });
}

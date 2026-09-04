import { MindustryVersionValue } from './mindustry-version-value';

/**
 * Comparison result for ordering.
 */
export type ComparisonResult = -1 | 0 | 1;

/**
 * Mindustry version comparator.
 *
 * Owns parsing, comparison, and invalid-value handling. No other module may
 * compare Mindustry builds with ad-hoc numeric conversion.
 *
 * Ordering rules:
 * - Compare major first (ascending).
 * - A version with no minor (e.g. "159") sorts BEFORE the same major with
 *   any minor (e.g. "159.0" > "159"). This matches Mindustry convention where
 *   "159" is the base release and "159.1" is a patch.
 * - When both have minors, compare minor numerically.
 */
export class MindustryVersionComparator {
  /**
   * Compare two parsed versions.
   * Returns -1 (a < b), 0 (equal), or 1 (a > b).
   */
  static compare(a: MindustryVersionValue, b: MindustryVersionValue): ComparisonResult {
    if (a.major !== b.major) {
      return a.major < b.major ? -1 : 1;
    }

    // Both minors null → equal
    if (a.minor === null && b.minor === null) return 0;
    // No minor sorts before any minor
    if (a.minor === null) return -1;
    if (b.minor === null) return 1;
    // Both have minors
    if (a.minor !== b.minor) {
      return a.minor < b.minor ? -1 : 1;
    }
    return 0;
  }

  /**
   * Parse two raw strings and compare. Returns null if either is unparseable.
   */
  static compareRaw(a: string | null | undefined, b: string | null | undefined): ComparisonResult | null {
    const va = MindustryVersionValue.parse(a);
    const vb = MindustryVersionValue.parse(b);
    if (!va || !vb) return null;
    return MindustryVersionComparator.compare(va, vb);
  }

  /**
   * True when the version satisfies `min <= version <= max`.
   * Null bounds are treated as unbounded on that side.
   */
  static inRange(
    version: MindustryVersionValue,
    min: MindustryVersionValue | null,
    max: MindustryVersionValue | null,
  ): boolean {
    if (min !== null && MindustryVersionComparator.compare(version, min) < 0) return false;
    if (max !== null && MindustryVersionComparator.compare(version, max) > 0) return false;
    return true;
  }

  /**
   * Return the newest (highest) version from a list. Returns null for empty input.
   */
  static newest(versions: MindustryVersionValue[]): MindustryVersionValue | null {
    if (versions.length === 0) return null;
    return versions.reduce((best, current) =>
      MindustryVersionComparator.compare(current, best) > 0 ? current : best,
    );
  }

  /**
   * Sort versions in ascending order (oldest first).
   */
  static sortAscending(versions: MindustryVersionValue[]): MindustryVersionValue[] {
    return [...versions].sort((a, b) => MindustryVersionComparator.compare(a, b));
  }
}

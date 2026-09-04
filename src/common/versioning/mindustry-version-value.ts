/**
 * Parsed Mindustry game version.
 *
 * Mindustry versions are a major build number, optionally followed by a minor
 * patch number (e.g. "159", "159.1", "159.7"). The comparator is the sole
 * authority on ordering; no module may compare builds with ad-hoc numeric
 * conversion.
 */
export class MindustryVersionValue {
  readonly major: number;
  readonly minor: number | null;

  private constructor(major: number, minor: number | null) {
    this.major = major;
    this.minor = minor;
  }

  /**
   * Parse a version string. Returns null for invalid input.
   *
   * Valid forms: "159", "159.1", "159.7"
   * Invalid: "", "abc", "159.", ".1", "159.1.2", negative numbers
   */
  static parse(raw: string | null | undefined): MindustryVersionValue | null {
    if (raw === null || raw === undefined) return null;
    const trimmed = raw.trim();
    if (trimmed === '') return null;

    const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
    if (!match) return null;

    const major = Number(match[1]);
    const minor = match[2] !== undefined ? Number(match[2]) : null;

    if (!Number.isFinite(major) || major < 0) return null;
    if (minor !== null && (!Number.isFinite(minor) || minor < 0)) return null;

    return new MindustryVersionValue(major, minor);
  }

  /**
   * Return a normalized display string.
   * "159" stays "159", "159.1" stays "159.1".
   */
  toString(): string {
    return this.minor !== null ? `${this.major}.${this.minor}` : `${this.major}`;
  }

  /**
   * Structural equality.
   */
  equals(other: MindustryVersionValue): boolean {
    return this.major === other.major && this.minor === other.minor;
  }
}

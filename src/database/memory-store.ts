interface StoredValue {
  value: string | Map<string, string> | Map<string, number>;
  expiresAt: number | null;
}

/**
 * In-process stand-in for the Redis operations this application actually uses.
 *
 * Engaged only while Redis is unreachable. `AuthService.verifySession` is the sole
 * authentication path and reads Redis on every authenticated request, so without a
 * fallback a Redis outage means nobody can use the site at all.
 *
 * Its limits are real and deliberate:
 *   • Per-process. Behind more than one worker each has its own view.
 *   • Not durable. Everything is lost on restart.
 *   • Not a replacement. Sessions written to Redis *before* the outage are not here,
 *     so those users are still signed out. What this buys is that the site keeps
 *     working — new logins, rate limiting, caches — instead of failing outright.
 *
 * Expiry is lazy (checked on read) plus a periodic sweep, so an idle key does not
 * pin memory forever.
 */
export class MemoryStore {
  private data = new Map<string, StoredValue>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private readonly sweepIntervalMs = 60_000) {}

  start(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this.sweep(), this.sweepIntervalMs);
    // Must not hold the process open on shutdown.
    this.sweepTimer.unref?.();
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  clear(): void {
    this.data.clear();
  }

  get size(): number {
    return this.data.size;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.data) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.data.delete(key);
      }
    }
  }

  private read(key: string): StoredValue | null {
    const entry = this.data.get(key);
    if (!entry) return null;

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return entry;
  }

  // ── String operations ────────────────────────────────────────────────────
  get(key: string): string | null {
    const entry = this.read(key);
    return typeof entry?.value === 'string' ? entry.value : null;
  }

  set(key: string, value: string, ttlSeconds?: number): void {
    this.data.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  del(key: string): number {
    return this.data.delete(key) ? 1 : 0;
  }

  exists(key: string): number {
    return this.read(key) ? 1 : 0;
  }

  expire(key: string, seconds: number): number {
    const entry = this.read(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  ttl(key: string): number {
    const entry = this.read(key);
    if (!entry) return -2; // Redis: key does not exist
    if (entry.expiresAt === null) return -1; // Redis: no expiry
    return Math.ceil((entry.expiresAt - Date.now()) / 1000);
  }

  incr(key: string): number {
    const current = Number(this.get(key) ?? 0);
    const next = (Number.isFinite(current) ? current : 0) + 1;
    const entry = this.read(key);
    this.data.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return next;
  }

  keys(pattern: string): string[] {
    const regex = patternToRegExp(pattern);
    const matches: string[] = [];
    for (const key of this.data.keys()) {
      if (regex.test(key) && this.read(key)) {
        matches.push(key);
      }
    }
    return matches;
  }

  // ── Hash operations ──────────────────────────────────────────────────────
  private hash(key: string, create: boolean): Map<string, string> | null {
    const entry = this.read(key);
    if (entry && entry.value instanceof Map) {
      return entry.value as Map<string, string>;
    }
    if (!create) return null;

    const map = new Map<string, string>();
    this.data.set(key, { value: map, expiresAt: entry?.expiresAt ?? null });
    return map;
  }

  hget(key: string, field: string): string | null {
    return this.hash(key, false)?.get(field) ?? null;
  }

  hset(key: string, field: string, value: string): number {
    const map = this.hash(key, true)!;
    const isNew = !map.has(field);
    map.set(field, value);
    return isNew ? 1 : 0;
  }

  hgetall(key: string): Record<string, string> {
    const map = this.hash(key, false);
    return map ? Object.fromEntries(map) : {};
  }

  hdel(key: string, ...fields: string[]): number {
    const map = this.hash(key, false);
    if (!map) return 0;
    let removed = 0;
    for (const field of fields) {
      if (map.delete(field)) removed += 1;
    }
    return removed;
  }

  // ── Sorted set (popular searches only) ───────────────────────────────────
  private zset(key: string, create: boolean): Map<string, number> | null {
    const entry = this.read(key);
    if (entry && entry.value instanceof Map) {
      return entry.value as Map<string, number>;
    }
    if (!create) return null;

    const map = new Map<string, number>();
    this.data.set(key, { value: map, expiresAt: entry?.expiresAt ?? null });
    return map;
  }

  zIncrBy(key: string, increment: number, member: string): number {
    const map = this.zset(key, true)!;
    const next = (map.get(member) ?? 0) + increment;
    map.set(member, next);
    return next;
  }

  zRevRange(key: string, start: number, stop: number): string[] {
    const map = this.zset(key, false);
    if (!map) return [];

    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).map(([member]) => member);
    // Redis treats a negative stop as an offset from the end, and the range is
    // inclusive.
    const end = stop < 0 ? sorted.length + stop + 1 : stop + 1;
    return sorted.slice(start, end);
  }
}

/** Translate a Redis glob pattern (`*`, `?`) into an anchored RegExp. */
function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

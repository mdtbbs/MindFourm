/**
 * A bounded, per-process request budget for routes that are registered directly on
 * the HTTP adapter and therefore never reach the Nest guard chain.
 *
 * Those routes (`/api/openapi/*.json`, `/api/v1/docs/*`, `/api/v1/reference`) sit
 * outside `BanGuard`, `RateLimitGuard` and `PhoneWriteGuard`. `/api/v1/reference`
 * renders thousands of lines of HTML from the ~1MB OpenAPI document on every hit,
 * so a crawler or a load test against it spends CPU the rest of the site needs and
 * shows up as latency and 503s elsewhere. Caching removes most of the cost; this
 * caps what is left.
 *
 * The budget is intentionally process-local: it exists to blunt a runaway client,
 * not to be an exact site-wide quota, and it must not add a Redis round-trip to
 * documentation reads. It fails open, matching `RateLimitGuard`'s stance that a
 * cache outage must never take the site down.
 */

export const DOCS_RATE_LIMIT_MAX = 120;
export const DOCS_RATE_LIMIT_WINDOW_MS = 60_000;

/** Above this many tracked identities the table is swept; crawlers skew long-tailed. */
const MAX_TRACKED_IDENTITIES = 5_000;

type Window = { count: number; resetAt: number };

export class SharedBudget {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly max: number = DOCS_RATE_LIMIT_MAX,
    private readonly windowMs: number = DOCS_RATE_LIMIT_WINDOW_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Consume one unit for `identity`. Returns `retryAfterSeconds` when the budget is gone. */
  consume(identity: string): { allowed: boolean; retryAfterSeconds: number } {
    const now = this.now();
    const existing = this.windows.get(identity);
    const window = existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + this.windowMs };

    window.count += 1;
    this.windows.set(identity, window);
    if (this.windows.size > MAX_TRACKED_IDENTITIES) this.sweep(now);

    if (window.count > this.max) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private sweep(now: number): void {
    for (const [identity, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(identity);
    }
  }
}

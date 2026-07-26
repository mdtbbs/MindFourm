import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  /** Maximum requests allowed inside the window. */
  max: number;
  /** Window length in seconds. */
  window: number;
}

/**
 * Tighten the rate limit for a route beyond the global default.
 *
 * Configuration used to live in a handler-name lookup table inside the guard,
 * which silently stopped matching as soon as handlers were renamed — every entry
 * in it was stale, so nothing was ever limited beyond the fallback. Declaring the
 * limit at the route keeps the two from drifting apart.
 */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options);

/** Skip rate limiting entirely (health checks, SSE streams). */
export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);

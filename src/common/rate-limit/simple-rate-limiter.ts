import type { Request, Response, NextFunction } from 'express';
import { getClientIp } from '../utils/client-context.util';

export interface SimpleRateLimitOptions {
  /** Maximum requests allowed per identity inside the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

type Bucket = { count: number; resetAt: number };

/**
 * A minimal fixed-window limiter for routes mounted on the raw Express adapter
 * (`/api/openapi/*.json`, developer docs).
 *
 * These routes cannot reuse `RateLimitGuard`: the guard is part of Nest's
 * `APP_GUARD` chain and only runs for controller handlers, so directly mounted
 * adapter routes bypass it entirely. A Redis-backed limiter would also add a
 * dependency to routes whose only job is to serve a static document that is
 * already cached, so an in-process counter is the right-sized tool here.
 *
 * It is intentionally best-effort: a single process holds the counters (the
 * deployment is single-instance, see ecosystem.config.js), and the map is swept
 * lazily so a long-lived process cannot grow it without bound.
 */
export function createRateLimitMiddleware(options: SimpleRateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  return function simpleRateLimit(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const now = Date.now();

    // Sweep expired buckets at most once a minute instead of on every request.
    if (now - lastSweep > options.windowMs) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      lastSweep = now;
    }

    const ip = getClientIp(req) || req.ip || 'unknown';
    const bucket = buckets.get(ip);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + options.windowMs });
      res.setHeader('X-RateLimit-Limit', String(options.max));
      res.setHeader('X-RateLimit-Remaining', String(options.max - 1));
      next();
      return;
    }

    bucket.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, options.max - bucket.count)));

    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: { code: 'RATE_LIMITED' }, message: 'RATE_LIMITED' });
      return;
    }

    next();
  };
}

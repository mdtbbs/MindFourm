import { createHash } from 'node:crypto';
import { SharedBudget } from './shared-budget.util';
import { getClientIp } from './client-context.util';
import { secretsMatch } from './secret-compare.util';

/**
 * Protection for handlers registered straight on the HTTP adapter.
 *
 * They are outside the Nest guard chain, so they need three things that the chain
 * would otherwise supply: a bounded request budget, cache headers, and the same
 * "this is an internal caller" exemption the guards apply — without it, SSR reads
 * of the documentation would be throttled together with crawlers hitting the
 * origin directly.
 */
export class AdapterRouteGuard {
  constructor(
    private readonly budget: SharedBudget,
    private readonly internalKey: () => string,
  ) {}

  /**
   * Returns false after writing a 429 when the caller is over budget.
   *
   * Non-GET methods are refused outright: these handlers are read-only, and
   * letting writer verbs through would only waste the budget on a body nobody reads.
   */
  check(request: any, response: any): boolean {
    if (!this.isReadableMethod(request?.method)) {
      this.sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
      return false;
    }

    // Internal callers must be exempted *before* the budget is consumed: charging
    // SSR reads against the `internal` identity would make a documentation page
    // that renders several sections start returning 429 to itself.
    if (this.isTrustedInternal(request)) return true;

    const { allowed, retryAfterSeconds } = this.budget.consume(this.identify(request));
    if (allowed) return true;

    response?.setHeader?.('Retry-After', String(retryAfterSeconds));
    this.sendJson(response, 429, { code: 'RATE_LIMITED', message: 'RATE_LIMITED' });
    return false;
  }

  private isReadableMethod(method: unknown): boolean {
    const normalized = String(method || 'GET').toUpperCase();
    return normalized === 'GET' || normalized === 'HEAD';
  }

  /**
   * Trusted server-side callers (the Next.js process) are exempt for the same
   * reason the rate-limit guard exempts them: they are not visitor traffic.
   */
  private isTrustedInternal(request: any): boolean {
    const expected = this.internalKey();
    if (!expected) return false;
    const supplied = request?.headers?.['x-forum-internal-key'];
    const value = Array.isArray(supplied) ? supplied[0] : supplied;
    return typeof value === 'string' && secretsMatch(value, expected);
  }

  private identify(request: any): string {
    if (this.isTrustedInternal(request)) return 'internal';
    // `clientIp` is the middleware-normalised value; the raw header is only the
    // fallback for direct handler invocation (tests, non-Nest mounts).
    const ip = request?.clientIp || getClientIp(request);
    if (ip) return `ip:${ip}`;
    // No trustworthy address (unusual for a production edge, possible in tests and
    // in direct container access): fall back to the socket peer rather than lumping
    // every such caller into one bucket.
    return `peer:${createHash('sha256').update(String(request?.socket?.remoteAddress || 'unknown')).digest('hex').slice(0, 16)}`;
  }

  private sendJson(response: any, status: number, body: unknown): void {
    response?.setHeader?.('Content-Type', 'application/json; charset=utf-8');
    response?.setHeader?.('Cache-Control', 'no-store');
    response?.status?.(status)?.json?.(body);
  }
}

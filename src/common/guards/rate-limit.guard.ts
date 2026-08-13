import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../database/redis.service';
import { ConfigService } from '@nestjs/config';
import { secretsMatch } from '../utils/secret-compare.util';
import { getClientIp, isLoopbackIp } from '../utils/client-context.util';
import { createHash } from 'crypto';
import {
  RATE_LIMIT_KEY,
  SKIP_RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';

// Fixed-window counter. INCR then EXPIRE-on-first-hit is atomic inside the script,
// so concurrent requests cannot lose the TTL and create an immortal counter.
const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;

/** Applied when a route declares no explicit @RateLimit. */
const DEFAULT_READ_LIMIT: RateLimitOptions = { max: 1200, window: 60 };
const DEFAULT_WRITE_LIMIT: RateLimitOptions = { max: 180, window: 60 };

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private redis: RedisService,
    private reflector: Reflector,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    if (this.isTrustedInternalRequest(req)) {
      return true;
    }
    const method = String(req.method || '').toUpperCase();

    const explicit = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const limit =
      explicit || (WRITE_METHODS.has(method) ? DEFAULT_WRITE_LIMIT : DEFAULT_READ_LIMIT);

    const key = `rate_limit:${this.identify(req)}:${method}:${this.routeKey(context, req)}`;

    let current: number;
    try {
      current = Number(
        await this.redis.eval(RATE_LIMIT_SCRIPT, [key], [limit.window.toString()]),
      );
    } catch (error) {
      // Fail open: a Redis outage should degrade rate limiting, not take the site
      // down. Ban enforcement and authentication are unaffected.
      this.logger.warn(`Rate limit check skipped: ${(error as Error).message}`);
      return true;
    }

    if (current > limit.max) {
      const response = context.switchToHttp().getResponse();
      response?.setHeader?.('Retry-After', String(limit.window));
      response?.setHeader?.('X-RateLimit-Limit', String(limit.max));
      response?.setHeader?.('X-RateLimit-Remaining', '0');
      throw new HttpException('请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

    const response = context.switchToHttp().getResponse();
    response?.setHeader?.('X-RateLimit-Limit', String(limit.max));
    response?.setHeader?.('X-RateLimit-Remaining', String(Math.max(0, limit.max - current)));

    return true;
  }

  /**
   * Prefer the authenticated user over the IP: users behind one NAT/CDN egress
   * would otherwise share a single bucket.
   */
  private identify(req: any): string {
    if (req.user?.id) {
      return `u:${req.user.id}`;
    }
    // This guard runs before controller-scoped JwtAuthGuard. The opaque session
    // token is therefore the only authenticated identity available here. Hash it
    // before placing it in Redis so a key dump cannot become a session leak.
    const sessionToken = this.readSessionToken(req);
    if (sessionToken) {
      return `s:${createHash('sha256').update(sessionToken).digest('hex').slice(0, 24)}`;
    }
    return `ip:${req.clientIp || getClientIp(req) || 'unknown'}`;
  }

  private readSessionToken(req: any): string | null {
    const fromParsedCookies = req.cookies?.forum_session;
    if (typeof fromParsedCookies === 'string' && fromParsedCookies) return fromParsedCookies;
    const rawCookie = req.headers?.cookie;
    if (typeof rawCookie !== 'string') return null;
    const match = rawCookie.match(/(?:^|;\s*)forum_session=([^;]+)/);
    if (!match?.[1]) return null;
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  }

  /**
   * SSR-to-API calls use a loopback connection (or an explicit secret when the
   * frontend is remote). They are not end-user traffic and must not consume a
   * shared CDN/IP bucket. Service-key calls are similarly authenticated before
   * their controller executes, so validating the same key here is safe.
   */
  private isTrustedInternalRequest(req: any): boolean {
    const header = (name: string) => {
      const value = req.headers?.[name];
      return Array.isArray(value) ? value[0] : value;
    };
    const internalKey = this.config.get<string>('app.internalApiKey') || process.env.FORUM_INTERNAL_API_KEY;
    const suppliedInternalKey = header('x-forum-internal-key');
    if (internalKey && typeof suppliedInternalKey === 'string' && secretsMatch(suppliedInternalKey, internalKey)) {
      return true;
    }

    const serviceKey = this.config.get<string>('easymanager.apiKey');
    const suppliedServiceKey = header('x-service-key');
    if (serviceKey && typeof suppliedServiceKey === 'string' && secretsMatch(suppliedServiceKey, serviceKey)) {
      return true;
    }

    return !header('x-forwarded-for') && isLoopbackIp(req.socket?.remoteAddress || req.ip || '');
  }

  /**
   * Bucket per route rather than per handler name, so limits survive renames and
   * two endpoints never consume each other's budget.
   */
  private routeKey(context: ExecutionContext, req: any): string {
    const routePath = req.route?.path;
    if (routePath) {
      return routePath;
    }
    return `${context.getClass().name}.${context.getHandler().name}`;
  }
}

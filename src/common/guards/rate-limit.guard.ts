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
import { RateLimitTelemetryService } from '../rate-limit/rate-limit-telemetry.service';
import { createHash } from 'crypto';
import {
  RATE_LIMIT_KEY,
  SKIP_RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';

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
    private telemetry: RateLimitTelemetryService,
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

    const bucket = this.bucketKey(context, req);
    const key = `rate_limit:${this.identify(req)}:${method}:${bucket}`;

    let current: number;
    try {
      current = await this.redis.incrementFixedWindow(key, limit.window);
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
      void this.telemetry.recordBlocked({
        route: bucket,
        identity: this.identityType(req),
        limit: limit.max,
        remaining: 0,
        ipSource: req.clientIpSource || 'connection',
      });
      const isVersionedApi = String(req.originalUrl || req.url || '').startsWith('/api/v1/');
      throw new HttpException(
        isVersionedApi ? { code: 'RATE_LIMITED', message: 'RATE_LIMITED' } : '请求过于频繁，请稍后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
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

  private identityType(req: any): 'user' | 'session' | 'ip' {
    if (req.user?.id) return 'user';
    return this.readSessionToken(req) ? 'session' : 'ip';
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

    // Container deployments reach the backend through a bridge network, so the
    // connection address is never loopback and every SSR read would otherwise be
    // counted as a visitor. The shared key above is the deployment-independent
    // signal; a loopback connection stays trusted for bare-metal setups that have
    // not configured the key yet.
    return !header('x-forwarded-for') && isLoopbackIp(req.socket?.remoteAddress || req.ip || '');
  }

  /**
   * Bucket per mounted route, not per handler name and not per bare router path.
   *
   * `req.route.path` alone is only the tail of the path, so every controller with a
   * `@Get(':id')` — resources, threads, posts, notices, users, messages — shared one
   * bucket. Reading resource details silently spent the budget for reading a thread,
   * and the resulting 429s looked like they came from unrelated endpoints. The
   * mount path (`req.baseUrl`, which includes the global `api` prefix and the
   * controller prefix) has to be part of the key, and the handler name is the
   * fallback so two routes can never collide by accident.
   */
  private bucketKey(context: ExecutionContext, req: any): string {
    const handler = `${context.getClass().name}.${context.getHandler().name}`;
    const routePath = req.route?.path;
    if (!routePath) {
      return handler;
    }
    // Only the leading slash is normalised: stripping the tail would make `/:id`
    // and a literal static segment share a key.
    const baseUrl = String(req.baseUrl || '');
    const route = String(routePath);
    const fullPath = `${baseUrl}${route.startsWith('/') ? route : `/${route}`}`.toLowerCase();
    return `${fullPath}|${handler}`;
  }
}

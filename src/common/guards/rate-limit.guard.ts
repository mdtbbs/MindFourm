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
const DEFAULT_READ_LIMIT: RateLimitOptions = { max: 300, window: 60 };
const DEFAULT_WRITE_LIMIT: RateLimitOptions = { max: 60, window: 60 };

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private redis: RedisService,
    private reflector: Reflector,
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
      throw new HttpException('请求过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }

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
    return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
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

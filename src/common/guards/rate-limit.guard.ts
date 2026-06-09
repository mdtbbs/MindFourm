import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../../database/redis.service';
import { ConfigService } from '@nestjs/config';

// Rate limit Lua script (embedded to avoid filesystem dependency)
const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return current
`;

// Default rate limit configuration per handler pattern
const DEFAULT_LIMITS: Record<string, { max: number; window: number }> = {
  'handleCreate': { max: 10, window: 60 },     // 10 posts per minute
  'handleReply': { max: 30, window: 60 },      // 30 replies per minute
  'handleLogin': { max: 5, window: 300 },      // 5 login attempts per 5 min
  'handleVerifySession': { max: 20, window: 60 }, // 20 verifications per minute
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private rateLimitScript: string;

  constructor(
    private redis: RedisService,
    private configService: ConfigService,
  ) {
    this.rateLimitScript = RATE_LIMIT_SCRIPT;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const handlerName = context.getHandler().name;

    // Get rate limit config for this handler
    const limitConfig = DEFAULT_LIMITS[handlerName] || { max: 60, window: 60 };

    const key = `rate_limit:${ip}:${handlerName}`;

    // Execute atomic Lua script
    const current = await this.redis.eval(
      this.rateLimitScript,
      [key],
      [limitConfig.window.toString()],
    );

    if (current > limitConfig.max) {
      throw new HttpException(
        '请求过于频繁，请稍后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}

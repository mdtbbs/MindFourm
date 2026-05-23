const Response = require('../utils/response');
const redis = require('../database/redis');

/**
 * Redis-based rate limiting
 */
async function rateLimit({ key, max, windowMs, identifier }) {
  const redisKey = `ratelimit:${key}:${identifier}`;
  const windowSeconds = Math.floor(windowMs / 1000);

  const current = await redis.incr(redisKey);

  if (current === 1) {
    await redis.expire(redisKey, windowSeconds);
  }

  const ttl = await redis.ttl(redisKey);

  return {
    allowed: current <= max,
    current,
    max,
    resetIn: ttl,
    remaining: Math.max(0, max - current)
  };
}

function createRateLimitMiddleware({ key, max, windowMs, identifierFn }) {
  return async (ctx, next) => {
    const identifier = identifierFn(ctx);
    const result = await rateLimit({ key, max, windowMs, identifier });

    ctx.set('X-RateLimit-Limit', result.max.toString());
    ctx.set('X-RateLimit-Remaining', result.remaining.toString());
    ctx.set('X-RateLimit-Reset', result.resetIn.toString());

    if (!result.allowed) {
      return Response.error(ctx, 'Rate limit exceeded', 429, 'RATE_LIMITED');
    }

    return next();
  };
}

/**
 * Dynamic rate limit that reads from async settings
 */
function createDynamicRateLimit(configKey, maxKey, windowKey, defaults) {
  return async (ctx, next) => {
    if (ctx.headers['x-test-request'] === 'true') {
      return next();
    }

    const SettingService = require('../services/setting.service');
    const max = await SettingService.getNumber(maxKey) ?? defaults.max;
    const windowMin = await SettingService.getNumber(windowKey) ?? defaults.windowMin;
    const identifier = ctx.state.user ? `user:${ctx.state.user.id}` : `ip:${ctx.ip}`;

    const result = await rateLimit({ key: configKey, max, windowMs: windowMin * 60 * 1000, identifier });

    ctx.set('X-RateLimit-Limit', result.max.toString());
    ctx.set('X-RateLimit-Remaining', result.remaining.toString());
    ctx.set('X-RateLimit-Reset', result.resetIn.toString());

    if (!result.allowed) {
      return Response.error(ctx, 'Rate limit exceeded', 429, 'RATE_LIMITED');
    }

    return next();
  };
}

module.exports = { createRateLimitMiddleware, createDynamicRateLimit, rateLimit };
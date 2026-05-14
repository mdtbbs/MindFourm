const Response = require('../utils/response');

// In-memory store: Map<key, Map<identifier, { count, resetTime }>>
const stores = new Map();

// Cleanup interval: prune expired entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, store] of stores.entries()) {
    for (const [identifier, record] of store.entries()) {
      if (now > record.resetTime) store.delete(identifier);
    }
    if (store.size === 0) stores.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
// Prevent cleanup timer from keeping process alive
if (cleanupTimer.unref) cleanupTimer.unref();

function rateLimit({ key, max, windowMs, identifier }) {
  let store = stores.get(key);
  if (!store) { store = new Map(); stores.set(key, store); }

  const now = Date.now();
  let record = store.get(identifier);

  if (!record || now > record.resetTime) {
    store.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  record.count++;
  return record.count <= max;
}

function createRateLimitMiddleware({ key, max, windowMs, identifierFn }) {
  return (ctx, next) => {
    const identifier = identifierFn(ctx);
    if (!rateLimit({ key, max, windowMs, identifier })) {
      return Response.error(ctx, 'Rate limit exceeded', 429, 'RATE_LIMITED');
    }
    return next();
  };
}

/**
 * Create rate limit middleware that reads values from settings at request time.
 * @param {string} configKey - e.g. 'post_create', 'reply_create', 'login'
 * @param {string} maxKey - settings key for max count, e.g. 'rate_post_max'
 * @param {string} windowKey - settings key for window in minutes, e.g. 'rate_post_window_min'
 * @param {object} defaults - fallback { max, windowMin } if settings not available
 */
function createDynamicRateLimit(configKey, maxKey, windowKey, defaults) {
  return (ctx, next) => {
    const SettingService = require('../services/setting.service');
    const max = SettingService.getNumber(maxKey) ?? defaults.max;
    const windowMin = SettingService.getNumber(windowKey) ?? defaults.windowMin;
    const identifier = ctx.state.user ? `user:${ctx.state.user.id}` : `ip:${ctx.ip}`;
    if (!rateLimit({ key: configKey, max, windowMs: windowMin * 60 * 1000, identifier })) {
      return Response.error(ctx, 'Rate limit exceeded', 429, 'RATE_LIMITED');
    }
    return next();
  };
}

function resetStore(key) {
  if (key) stores.delete(key); else stores.clear();
}

module.exports = { createRateLimitMiddleware, createDynamicRateLimit, rateLimit, resetStore };

const Response = require('../utils/response');

// In-memory store: Map<key, Map<identifier, { count, resetTime }>>
const stores = new Map();

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

function resetStore(key) {
  if (key) stores.delete(key); else stores.clear();
}

module.exports = { createRateLimitMiddleware, rateLimit, resetStore };

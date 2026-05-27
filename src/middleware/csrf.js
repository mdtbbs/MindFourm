const crypto = require('crypto');

/**
 * CSRF Protection Middleware for Koa
 * Uses double-submit cookie pattern:
 * 1. Server sets csrf_token cookie
 * 2. Client must send X-CSRF-Token header matching the cookie
 * 3. Validates on POST/PUT/DELETE requests
 */

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Timing-safe string comparison
 */
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Middleware to set CSRF cookie on responses
 */
async function setCsrfCookie(ctx, next) {
  await next();
  // Set CSRF cookie if not present
  if (!ctx.cookies.get('csrf_token')) {
    const token = generateCsrfToken();
    ctx.cookies.set('csrf_token', token, {
      httpOnly: false, // Must be readable by JS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
  }
}

/**
 * Middleware to validate CSRF token on state-changing requests
 */
async function validateCsrf(ctx, next) {
  const method = ctx.method.toUpperCase();

  // Only validate POST/PUT/DELETE
  if (!['POST', 'PUT', 'DELETE'].includes(method)) {
    return next();
  }

  // Skip CSRF for exempt paths
  const path = ctx.path;
  const exemptPaths = [
    '/api/auth/callback',  // OAuth callback (no session yet)
    '/api/auth/exchange',  // Token exchange (uses OAuth code)
    '/api/auth/logout',    // Logout (can work without CSRF)
  ];

  if (exemptPaths.some(p => path.startsWith(p))) {
    return next();
  }

  const cookieToken = ctx.cookies.get('csrf_token');
  const headerToken = ctx.get('x-csrf-token');

  if (!cookieToken || !headerToken) {
    ctx.status = 403;
    ctx.body = { success: false, message: '缺少 CSRF token' };
    return;
  }

  // Timing-safe comparison
  if (!timingSafeCompare(cookieToken, headerToken)) {
    ctx.status = 403;
    ctx.body = { success: false, message: 'CSRF token 无效' };
    return;
  }

  return next();
}

/**
 * Endpoint to get/refresh CSRF token
 */
async function csrfTokenEndpoint(ctx) {
  const token = ctx.cookies.get('csrf_token') || generateCsrfToken();

  ctx.cookies.set('csrf_token', token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
  });

  ctx.body = { success: true, csrf_token: token };
}

module.exports = {
  setCsrfCookie,
  validateCsrf,
  csrfTokenEndpoint,
  generateCsrfToken
};
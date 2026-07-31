import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { isTestAuthEnabled } from '../../modules/auth/test-auth.util';

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * `/api/auth/callback` is a top-level browser redirect from MindAuth, so it can
 * never carry a header token.
 *
 * The E2E test-login route is exempt only while test auth is enabled — leaving it
 * permanently exempt meant the backdoor was also reachable cross-site.
 */
function buildExemptPaths(): Set<string> {
  const paths = new Set([
    '/api/auth/callback',
    '/api/auth/validate-credentials', // Service-to-service API (uses ExternalApiKeyGuard)
  ]);
  if (isTestAuthEnabled()) {
    paths.add('/api/auth/test-login');
  }
  return paths;
}

const EXEMPT_PATHS = buildExemptPaths();

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) return cookies;

    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key) return cookies;

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
    return cookies;
  }, {});
}

function tokensMatch(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function isExempt(req: Request): boolean {
  if (EXEMPT_PATHS.has(req.path)) return true;
  if (req.path.startsWith('/api/external/')) return true;
  if (req.path.startsWith('/api/service-api/')) return true;
  if (req.path.startsWith('/api/auto-post/')) return true;
  return false;
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  const cookies = (req as any).cookies || parseCookies(req.headers.cookie);
  (req as any).cookies = cookies;

  const token = cookies[CSRF_COOKIE] || randomBytes(32).toString('hex');
  if (!cookies[CSRF_COOKIE]) {
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  const method = String(req.method || '').toUpperCase();
  if (!WRITE_METHODS.has(method) || isExempt(req)) {
    return next();
  }

  const headerToken = req.headers[CSRF_HEADER];
  const requestToken = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  if (!requestToken || !tokensMatch(token, String(requestToken))) {
    res.status(403).json({
      success: false,
      message: 'CSRF token invalid',
    });
    return;
  }

  next();
}

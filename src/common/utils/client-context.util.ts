import type { Request } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    clientIp?: string;
    clientRegion?: string | null;
  }
}

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1']);

function firstHeaderValue(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.split(',')[0].trim() : '';
}

/**
 * The production edge is deliberately trusted to overwrite X-Forwarded-For.
 * Read it before Express' proxy-derived `req.ip` so every layer (limits, bans,
 * audits and content provenance) uses exactly the same client identity.
 */
export function getClientIp(request: Pick<Request, 'headers' | 'ip' | 'socket'> | any): string {
  const headers = request?.headers || {};
  const forwarded = firstHeaderValue(headers['x-forwarded-for']);
  const esaIp = firstHeaderValue(headers['ali-real-client-ip']);
  const realIp = firstHeaderValue(headers['x-real-ip']);
  const fallback = request?.ip || request?.socket?.remoteAddress || '';
  return normalizeClientIp(forwarded || esaIp || realIp || fallback);
}

/** Province/region is supplied by the CDN; never inferred from a browser claim. */
export function getClientRegion(request: Pick<Request, 'headers'> | any): string | null {
  const headers = request?.headers || {};
  const value = firstHeaderValue(
    headers['ip-province-code']
    || headers['x-client-province']
    || headers['ali-ip-province']
    || headers['ali-ip-city'],
  );
  return value ? value.slice(0, 100) : null;
}

export function normalizeClientIp(value: unknown): string {
  const ip = typeof value === 'string' ? value.trim().replace(/^::ffff:/i, '') : '';
  return ip.slice(0, 45);
}

export function isLoopbackIp(ip: string): boolean {
  return LOOPBACK_IPS.has(normalizeClientIp(ip));
}

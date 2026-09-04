import type { Request } from 'express';
import { isIP } from 'node:net';

declare module 'express-serve-static-core' {
  interface Request {
    clientIp?: string;
    clientRegion?: string | null;
    clientIpSource?: string;
  }
}

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1']);

function firstHeaderValue(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.split(',')[0].trim() : '';
}

type ClientIpHeader = 'ali-real-client-ip' | 'x-real-ip' | 'cf-connecting-ip' | 'x-forwarded-for';

const CLIENT_IP_HEADERS: ClientIpHeader[] = [
  // ESA supplies this authoritative address while X-Forwarded-For can contain
  // the ESA edge address when an additional origin proxy appends to the chain.
  'ali-real-client-ip',
  'x-real-ip',
  'cf-connecting-ip',
  'x-forwarded-for',
];

function getTrustedHeaderIp(headers: Record<string, unknown>): { ip: string; source: ClientIpHeader } | null {
  for (const source of CLIENT_IP_HEADERS) {
    const ip = normalizeClientIp(firstHeaderValue(headers[source]));
    if (ip) return { ip, source };
  }
  return null;
}

/**
 * The production edge is deliberately trusted to overwrite the CDN client-IP
 * headers. Prefer the ESA-specific header so limits, bans, audits and content
 * provenance keep the visitor address instead of an edge address.
 */
export function getClientIp(request: Pick<Request, 'headers' | 'ip' | 'socket'> | any): string {
  const headers = request?.headers || {};
  const fromHeader = getTrustedHeaderIp(headers);
  if (fromHeader) return fromHeader.ip;
  const fallback = request?.ip || request?.socket?.remoteAddress || '';
  return normalizeClientIp(fallback);
}

/** Records which trusted edge header supplied the address without persisting the address itself. */
export function getClientIpSource(request: Pick<Request, 'headers'> | any): string {
  const headers = request?.headers || {};
  return getTrustedHeaderIp(headers)?.source || 'connection';
}

/** Location is supplied by the CDN; never inferred from a browser claim. */
export function getClientRegion(request: Pick<Request, 'headers'> | any): string | null {
  const headers = request?.headers || {};
  const value = firstHeaderValue(
    headers['ip-province-code']
    || headers['x-client-province']
    || headers['ali-ip-province']
    || headers['ali-ip-city'],
  );
  if (value) return value.slice(0, 100);

  // ESA supplies the country as an ISO 3166-1 Alpha-2 code (for example, cn).
  const country = firstHeaderValue(headers['ali-ip-country']);
  return /^[a-z]{2}$/i.test(country) ? country.toUpperCase() : null;
}

export function normalizeClientIp(value: unknown): string {
  if (typeof value !== 'string') return '';
  let ip = value.trim();

  const bracketedIpv6 = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketedIpv6) {
    ip = bracketedIpv6[1];
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.slice(0, ip.lastIndexOf(':'));
  }

  const unmappedIpv4 = ip.replace(/^::ffff:/i, '');
  if (unmappedIpv4 !== ip && isIP(unmappedIpv4) === 4) ip = unmappedIpv4;

  return isIP(ip) ? ip : '';
}

export function isLoopbackIp(ip: string): boolean {
  return LOOPBACK_IPS.has(normalizeClientIp(ip));
}

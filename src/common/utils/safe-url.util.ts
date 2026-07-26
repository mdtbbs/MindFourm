import { BadRequestException } from '@nestjs/common';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Whether a URL is safe to hand to `res.redirect` or render as an `href`.
 *
 * Blocks `javascript:`, `data:`, `file:` and friends. Stored values are checked at
 * use time as well as on write, because rows created before validation existed can
 * still hold anything.
 */
export function isSafeExternalUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  try {
    const url = new URL(value.trim());
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    // Not absolute; relative paths are fine for internal redirects but this helper
    // is only used for outbound links.
    return false;
  }
}

/**
 * Hostnames that must never be reachable from a server-initiated request.
 *
 * This is a hostname/literal-IP check only — it does not resolve DNS, so it does
 * not stop a deliberately crafted domain that resolves to a private address
 * (DNS rebinding). It does stop the common cases: cloud metadata endpoints,
 * loopback, link-local and RFC 1918 ranges entered directly.
 */
function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return true;
  }

  // IPv6 loopback / link-local / unique-local
  if (host === '::1' || host === '::' || host.startsWith('fe80:') || /^f[cd][0-9a-f]{2}:/.test(host)) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) {
    return false;
  }

  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  if ([a, b, Number(ipv4[3]), Number(ipv4[4])].some((octet) => octet > 255)) {
    return true; // not a valid address; refuse rather than guess
  }

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast / reserved

  return false;
}

/**
 * Whether a URL is safe for the server itself to call (webhooks and similar).
 *
 * Stricter than {@link isSafeExternalUrl}: also refuses private and loopback
 * destinations, which an outbound request from the server can otherwise reach even
 * though a browser could not.
 */
export function isPublicHttpUrl(value: unknown): boolean {
  if (!isSafeExternalUrl(value)) {
    return false;
  }

  try {
    const url = new URL((value as string).trim());
    return !isPrivateHostname(url.hostname);
  } catch {
    return false;
  }
}

export function assertSafeRedirectUrl(value: unknown): string {
  if (!isSafeExternalUrl(value)) {
    throw new BadRequestException('目标链接无效');
  }
  return (value as string).trim();
}

export interface ResolvePublicSiteUrlOptions {
  configuredUrl?: string | null;
  envUrl?: string | null;
  profileDomain?: string | null;
  nodeEnv?: string | null;
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((value, index) =>
    !/^\d{1,3}$/.test(parts[index]) || !Number.isInteger(value) || value < 0 || value > 255
  )) return null;
  return octets;
}

export function isLocalOrPrivateHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host === '::' || host === '0.0.0.0') return true;

  const ipv4 = parseIpv4(host);
  if (ipv4) {
    const [a, b] = ipv4;
    return a === 10
      || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }

  return /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
}

export function normalizeSiteUrl(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error('URL 不能为空');

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('URL 格式无效');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持 http:// 或 https://');
  }
  if (url.username || url.password) {
    throw new Error('URL 不能包含用户名或密码');
  }
  if (url.search || url.hash) {
    throw new Error('站点 URL 不能包含查询参数或片段');
  }

  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

export function validateConfiguredPublicSiteUrl(value: string, nodeEnv = process.env.NODE_ENV): string {
  const normalized = normalizeSiteUrl(value);
  const parsed = new URL(normalized);

  if (nodeEnv === 'production') {
    if (parsed.protocol !== 'https:') {
      throw new Error('生产环境站点 URL 必须使用 HTTPS');
    }
    if (isLocalOrPrivateHostname(parsed.hostname)) {
      throw new Error('生产环境站点 URL 不能使用 localhost、回环地址或私网地址');
    }
  }

  return normalized;
}

export function resolvePublicSiteUrl(options: ResolvePublicSiteUrlOptions): string {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const candidates = [options.configuredUrl, options.envUrl];

  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    try {
      return validateConfiguredPublicSiteUrl(candidate, nodeEnv);
    } catch {
      // Continue to the next trusted fallback. A stale localhost value in the
      // database must never override a valid production environment/profile URL.
    }
  }

  if (nodeEnv !== 'production') {
    return 'http://localhost:3000';
  }

  if (options.profileDomain?.trim()) {
    return validateConfiguredPublicSiteUrl(`https://${options.profileDomain.trim()}`, 'production');
  }

  throw new Error('No valid public site URL is configured for production');
}

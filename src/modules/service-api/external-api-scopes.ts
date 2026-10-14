export const EXTERNAL_API_SCOPES = [
  'posts:read',
  'posts:write',
  'posts:delete',
  'posts:moderate',
  'replies:read',
  'replies:write',
  'replies:delete',
  'resources:read',
  'resources:write',
  'resources:delete',
  'resources:moderate',
  'users:read',
  'users:impersonate',
  'users:bypass_phone_verification',
  'images:write',
  'categories:read',
  'tags:read',
  'audit:read',
  'lanlink:auth',
  // Narrow compatibility scope for the legacy LanLink quick-code endpoints.
  // It is deliberately separate from `lanlink:auth`: the quick-code routes
  // return LanLink identity fields, and a deployment has to opt in through
  // the legacy flag before the routes are reached at all.
  'lanlink:legacy_quick_code',
  'backupsave:auth',
  'friends:read',
  'presence:read',
  'presence:write',
  'notifications:write',
  'admin:*',
  '*',
] as const;

export type ExternalApiScope = typeof EXTERNAL_API_SCOPES[number] | `${string}:${string}`;

export interface ExternalApiKeyContext {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string[];
  allowed_ips: string[];
  default_user_id: number | null;
  rate_limit_per_minute: number;
}

export function hasExternalScope(scopes: readonly string[], requiredScope: string): boolean {
  if (scopes.includes('*')) {
    return true;
  }
  if (scopes.includes(requiredScope)) {
    return true;
  }

  const [domain] = requiredScope.split(':');
  return scopes.includes(`${domain}:*`) || scopes.includes('admin:*');
}

export function hasAnyExternalScope(scopes: readonly string[], requiredScopes: readonly string[]): boolean {
  return requiredScopes.some((scope) => hasExternalScope(scopes, scope));
}

/**
 * `*`, `admin:*` and `domain:*` all satisfy the general matcher above. The
 * routes that parse identities or validate credentials must not accept them:
 * those routes are reviewed against a dedicated, narrowly issued key, so a
 * key carrying any wildcard cannot prove that review happened. This is the
 * deny override behind `@ExternalStrictScope`.
 */
export function isWildcardExternalScope(scope: string): boolean {
  return scope === '*' || scope.endsWith(':*');
}

/**
 * Dedicated-scope check for authentication-sensitive routes. The key must
 * name one of the required scopes exactly and must not carry any wildcard
 * grant, even when the wildcard would otherwise match.
 */
export function hasStrictExternalScope(scopes: readonly string[], requiredScopes: readonly string[]): boolean {
  if (!requiredScopes.length) {
    return false;
  }
  if (scopes.some(isWildcardExternalScope)) {
    return false;
  }
  return requiredScopes.some((scope) => scopes.includes(scope));
}

export function uniqueScopes(scopes: readonly string[] = []): string[] {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];
}

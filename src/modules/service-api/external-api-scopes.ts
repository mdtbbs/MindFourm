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

export function uniqueScopes(scopes: readonly string[] = []): string[] {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))];
}

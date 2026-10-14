import { SetMetadata } from '@nestjs/common';

/**
 * Deny override for authentication-sensitive external routes.
 *
 * The general `@ExternalScope` matcher accepts `*`, `admin:*` and `domain:*`,
 * which is correct for ordinary service integrations but not for routes that
 * parse identities or validate credentials: a wildcard grant cannot prove that
 * the dedicated key those routes expect was reviewed. `@ExternalStrictScope`
 * requires an exact scope and rejects a key carrying *any* wildcard grant, even
 * when the general matcher would have passed.
 *
 * Routes using this decorator are also treated as authentication-sensitive for
 * rate limiting: the shared Redis counter must be reachable, otherwise the
 * request fails closed with `SECURITY_DEPENDENCY_UNAVAILABLE` instead of
 * validating credentials without a global limiter (see ExternalApiKeyGuard).
 */
export const EXTERNAL_STRICT_SCOPE_KEY = 'externalApiStrictScopes';

export const ExternalStrictScope = (...scopes: string[]) =>
  SetMetadata(EXTERNAL_STRICT_SCOPE_KEY, scopes);

export interface ExternalLegacyFlagOptions {
  /** ConfigService path of the flag, e.g. `lanlink.legacyQuickCodeEnabled`. */
  configPath: string;
  /** Stable error code returned while the flag is off. */
  code: string;
  message: string;
}

/**
 * Opt-in gate for compatibility routes that exist only for legacy callers.
 * When the flag is off (the default), the route refuses before any scope
 * evaluation, so a deployment never exposes the legacy surface implicitly.
 */
export const EXTERNAL_LEGACY_FLAG_KEY = 'externalApiLegacyFlag';

export const ExternalLegacyFlag = (options: ExternalLegacyFlagOptions) =>
  SetMetadata(EXTERNAL_LEGACY_FLAG_KEY, options);

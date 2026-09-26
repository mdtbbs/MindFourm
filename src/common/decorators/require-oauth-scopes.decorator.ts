import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const REQUIRED_OAUTH_SCOPES = 'mdtbbs:required-oauth-scopes';

/**
 * Runtime scope requirement plus a small OpenAPI extension used by the
 * developer reference. Keeping both on one decorator stops the docs from
 * drifting away from the guard configuration.
 */
export const RequireOAuthScopes = (...scopes: string[]) => applyDecorators(
  SetMetadata(REQUIRED_OAUTH_SCOPES, scopes),
  ApiExtension('x-required-scopes', scopes),
);

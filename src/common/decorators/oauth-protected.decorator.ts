import { applyDecorators, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtension,
  ApiForbiddenResponse,
  ApiSecurity,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { OAuthScopeGuard } from '../guards/oauth-scope.guard';
import { RequireOAuthScopes } from './require-oauth-scopes.decorator';
import { OptionalAuth } from './public.decorator';

/**
 * Protect a V1 operation for forum sessions and MindAuth OAuth Bearer tokens.
 * Cookie/mobile sessions retain their legacy behavior; OAuth clients must hold
 * each declared scope. OpenAPI records the Bearer requirement and the scopes.
 */
export function OAuthProtected(...scopes: string[]) {
  if (!scopes.length || scopes.some(scope => !scope.trim())) {
    throw new Error('OAuthProtected requires at least one scope');
  }
  return applyDecorators(
    UseGuards(JwtAuthGuard, OAuthScopeGuard),
    RequireOAuthScopes(...scopes),
    ApiBearerAuth('MindAuthBearer'),
    ApiExtension('x-required-scopes', scopes),
    ApiUnauthorizedResponse({ description: '需要有效的 MindAuth access token 或 MDTBBS 登录会话。' }),
    ApiForbiddenResponse({ description: '访问令牌缺少该接口要求的 OAuth scope，或当前账号/站点策略不允许此操作。' }),
  );
}

/** Protect OAuth Bearers while keeping the endpoint's anonymous read path. */
export function OAuthOptionalProtected(...scopes: string[]) {
  if (!scopes.length || scopes.some(scope => !scope.trim())) {
    throw new Error('OAuthOptionalProtected requires at least one scope');
  }
  return applyDecorators(
    OptionalAuth(),
    UseGuards(JwtAuthGuard, OAuthScopeGuard),
    RequireOAuthScopes(...scopes),
    // OpenAPI treats these as alternatives: anonymous access or a Bearer
    // token whose scopes are described by x-oauth-scopes-if-bearer.
    ApiSecurity({}),
    ApiBearerAuth('MindAuthBearer'),
    ApiExtension('x-oauth-scopes-if-bearer', scopes),
    ApiForbiddenResponse({ description: `携带 MindAuth Bearer 时需要 scope：${scopes.join(', ')}` }),
  );
}

/** Attach scope metadata to routes whose guard also enforces product policy. */
export function OAuthScopeDocumentation(...scopes: string[]) {
  if (!scopes.length || scopes.some(scope => !scope.trim())) {
    throw new Error('OAuthScopeDocumentation requires at least one scope');
  }
  return applyDecorators(
    ApiExtension('x-required-scopes', scopes),
    ApiForbiddenResponse({ description: `需要 OAuth scope：${scopes.join(', ')}` }),
  );
}

/** Document a public route that enforces scope only when an OAuth Bearer is sent. */
export function OAuthScopeIfBearer(...scopes: string[]) {
  if (!scopes.length || scopes.some(scope => !scope.trim())) {
    throw new Error('OAuthScopeIfBearer requires at least one scope');
  }
  return applyDecorators(
    ApiSecurity({}),
    ApiBearerAuth('MindAuthBearer'),
    ApiExtension('x-oauth-scopes-if-bearer', scopes),
    ApiForbiddenResponse({ description: `携带 MindAuth Bearer 时需要 scope：${scopes.join(', ')}` }),
  );
}

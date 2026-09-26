import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiV1Exception } from '../exceptions/api-v1.exception';
import { REQUIRED_OAUTH_SCOPES } from '../decorators/require-oauth-scopes.decorator';

@Injectable()
export class OAuthScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_OAUTH_SCOPES, [
      context.getHandler(), context.getClass(),
    ]) || [];
    if (!required.length) return true;
    const request = context.switchToHttp().getRequest();
    const auth = request.authContext;
    // Anonymous reads and existing first-party session/mobile credentials keep
    // their published behavior. Only OAuth Bearers are restricted by scopes.
    if (auth?.source !== 'mindauth_oauth') return true;
    const missing = required.filter(scope => !auth.scopes?.includes(scope));
    if (missing.length) {
      throw new ApiV1Exception('INSUFFICIENT_SCOPE', HttpStatus.FORBIDDEN, '授权权限不足', false, [{ requiredScopes: missing }]);
    }
    return true;
  }
}

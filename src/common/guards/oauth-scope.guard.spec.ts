import { ExecutionContext } from '@nestjs/common';
import { OAuthScopeGuard } from './oauth-scope.guard';

function context(request: any): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

describe('OAuthScopeGuard', () => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['forum.write']) } as any;

  it('rejects an OAuth Bearer that lacks the required scope with a stable code', () => {
    const guard = new OAuthScopeGuard(reflector);
    try {
      guard.canActivate(context({ authContext: { source: 'mindauth_oauth', scopes: ['forum.read'] } }));
      throw new Error('expected missing scope to be rejected');
    } catch (error: any) {
      expect(error).toMatchObject({ code: 'INSUFFICIENT_SCOPE' });
      expect(error.details).toEqual([{ requiredScopes: ['forum.write'] }]);
    }
  });

  it('allows an OAuth Bearer with the exact required scope and leaves anonymous reads alone', () => {
    const guard = new OAuthScopeGuard(reflector);
    expect(guard.canActivate(context({ authContext: { source: 'mindauth_oauth', scopes: ['forum.write'] } }))).toBe(true);
    expect(guard.canActivate(context({}))).toBe(true);
  });

  it('preserves legacy session and mobile compatibility without OAuth scopes', () => {
    const guard = new OAuthScopeGuard(reflector);
    expect(guard.canActivate(context({ authContext: { source: 'forum_session', scopes: [] } }))).toBe(true);
    expect(guard.canActivate(context({ authContext: { source: 'forum_mobile_legacy', scopes: [] } }))).toBe(true);
  });
});

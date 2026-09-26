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
    expect(() => guard.canActivate(context({ authContext: { source: 'mindauth_oauth', scopes: ['forum.read'] } })))
      .toThrow(expect.objectContaining({ code: 'INSUFFICIENT_SCOPE' }));
  });

  it('preserves legacy session and mobile compatibility without OAuth scopes', () => {
    const guard = new OAuthScopeGuard(reflector);
    expect(guard.canActivate(context({ authContext: { source: 'forum_session', scopes: [] } }))).toBe(true);
    expect(guard.canActivate(context({ authContext: { source: 'forum_mobile_legacy', scopes: [] } }))).toBe(true);
  });
});

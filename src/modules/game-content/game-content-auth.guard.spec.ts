import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GameContentAuthGuard, GameContentRequiredAuthGuard } from './game-content-auth.guard';

function context(request: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as any;
}

describe('GameContentAuthGuard', () => {
  it('validates MindAuth bearer through the unified resolver and maps auth context', async () => {
    const user = { id: 42, mindauth_id: 88, username: 'builder', phone_verified: true };
    const contextValue = { source: 'mindauth_oauth', clientId: 'game', scopes: ['resource.read'], partyType: 'third_party' };
    const auth = { resolveMindAuthBearer: jest.fn().mockResolvedValue({ user, context: contextValue }) };
    const bans = { assertUserNotBanned: jest.fn().mockResolvedValue(undefined) };
    const settings = { getBoolean: jest.fn().mockResolvedValue(true) };
    const guard = new GameContentAuthGuard(auth as any, bans as any, settings as any);
    const req = { headers: { authorization: 'Bearer signed-token-value' }, method: 'GET', path: '/v1/game-content/maps' };

    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(auth.resolveMindAuthBearer).toHaveBeenCalledWith('signed-token-value');
    expect(bans.assertUserNotBanned).toHaveBeenCalledWith(42);
    expect(req.user).toBe(user);
    expect(req.authContext).toBe(contextValue);
  });

  it('allows an anonymous public request without contacting MindAuth', async () => {
    const auth = { resolveMindAuthBearer: jest.fn() };
    const guard = new GameContentAuthGuard(auth as any, { assertUserNotBanned: jest.fn() } as any, { getBoolean: jest.fn().mockResolvedValue(true) } as any);
    await expect(guard.canActivate(context({ headers: {} }))).resolves.toBe(true);
    expect(auth.resolveMindAuthBearer).not.toHaveBeenCalled();
  });

  it('rejects invalid bearer tokens and phone-ineligible write callers', async () => {
    const auth = { resolveMindAuthBearer: jest.fn().mockRejectedValue(new Error('upstream response contains sensitive details')) };
    const guard = new GameContentAuthGuard(auth as any, { assertUserNotBanned: jest.fn() } as any, { getBoolean: jest.fn().mockResolvedValue(true) } as any);
    await expect(guard.canActivate(context({ headers: { authorization: 'Bearer invalid' } }))).rejects.toBeInstanceOf(UnauthorizedException);
    const required = new GameContentRequiredAuthGuard({ checkNeedsTermsAcceptance: jest.fn().mockResolvedValue(false) } as any, { getBoolean: jest.fn().mockResolvedValue(true) } as any);
    await expect(required.canActivate(context({ user: null }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(required.canActivate(context({ user: { phone_verified: false } }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps the forum terms acceptance requirement on write APIs', async () => {
    const required = new GameContentRequiredAuthGuard({ checkNeedsTermsAcceptance: jest.fn().mockResolvedValue(true) } as any, { getBoolean: jest.fn().mockResolvedValue(true) } as any);
    await expect(required.canActivate(context({ user: { phone_verified: true } }))).rejects.toMatchObject({ code: 'TERMS_ACCEPTANCE_REQUIRED' });
  });

  it('requires explicit resource scopes for OAuth reads and uploads', async () => {
    const user = { id: 1, phone_verified: true };
    const auth = { resolveMindAuthBearer: jest.fn().mockResolvedValue({ user, context: { source: 'mindauth_oauth', scopes: [] } }) };
    const guard = new GameContentAuthGuard(auth as any, { assertUserNotBanned: jest.fn() } as any, { getBoolean: jest.fn().mockResolvedValue(true) } as any);
    await expect(guard.canActivate(context({ headers: { authorization: 'Bearer token' }, path: '/v1/game-content/maps', method: 'GET' }))).rejects.toMatchObject({ code: 'INSUFFICIENT_SCOPE' });
  });
});

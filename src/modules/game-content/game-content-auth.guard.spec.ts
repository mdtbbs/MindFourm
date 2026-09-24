import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GameContentAuthGuard, GameContentRequiredAuthGuard } from './game-content-auth.guard';

function context(request: any): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as any;
}

describe('GameContentAuthGuard', () => {
  it('validates MindAuth bearer through userinfo and maps the identity to the local user', async () => {
    const user = { id: 42, mindauth_id: 88, username: 'builder', phone_verified: true };
    const auth = { getUserInfo: jest.fn().mockResolvedValue({ id: 88, username: 'builder' }), getOrCreateUser: jest.fn().mockResolvedValue(user) };
    const bans = { assertUserNotBanned: jest.fn().mockResolvedValue(undefined) };
    const guard = new GameContentAuthGuard(auth as any, bans as any);
    const req = { headers: { authorization: 'Bearer signed-token-value' } };

    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(auth.getUserInfo).toHaveBeenCalledWith('signed-token-value');
    expect(auth.getOrCreateUser).toHaveBeenCalledWith({ id: 88, username: 'builder' });
    expect(bans.assertUserNotBanned).toHaveBeenCalledWith(42);
    expect(req.user).toBe(user);
  });

  it('allows an anonymous public request without contacting MindAuth', async () => {
    const auth = { getUserInfo: jest.fn(), getOrCreateUser: jest.fn() };
    const guard = new GameContentAuthGuard(auth as any, { assertUserNotBanned: jest.fn() } as any);
    await expect(guard.canActivate(context({ headers: {} }))).resolves.toBe(true);
    expect(auth.getUserInfo).not.toHaveBeenCalled();
  });

  it('rejects invalid bearer tokens and phone-ineligible write callers', async () => {
    const auth = { getUserInfo: jest.fn().mockRejectedValue(new Error('upstream response contains sensitive details')) };
    const guard = new GameContentAuthGuard(auth as any, { assertUserNotBanned: jest.fn() } as any);
    await expect(guard.canActivate(context({ headers: { authorization: 'Bearer invalid' } }))).rejects.toBeInstanceOf(UnauthorizedException);
    const required = new GameContentRequiredAuthGuard({ checkNeedsTermsAcceptance: jest.fn().mockResolvedValue(false) } as any);
    await expect(required.canActivate(context({ user: null }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(required.canActivate(context({ user: { phone_verified: false } }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps the forum terms acceptance requirement on write APIs', async () => {
    const required = new GameContentRequiredAuthGuard({ checkNeedsTermsAcceptance: jest.fn().mockResolvedValue(true) } as any);
    await expect(required.canActivate(context({ user: { phone_verified: true } }))).rejects.toMatchObject({ code: 'TERMS_ACCEPTANCE_REQUIRED' });
  });
});

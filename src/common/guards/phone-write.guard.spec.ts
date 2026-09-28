jest.mock('../../modules/auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PhoneWriteGuard } from './phone-write.guard';
import type { AuthService } from '../../modules/auth/auth.service';
import { SiteConfigService } from '../../config/site-profile';

function createContext(method: string, sessionToken?: string) {
  const request: any = {
    method,
    cookies: sessionToken ? { forum_session: sessionToken } : {},
    headers: {},
  };

  return {
    request,
    context: {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as any,
  };
}

describe('PhoneWriteGuard', () => {
  function createGuard(user: any, skipPhoneVerification = false, profile = 'mdtbbs') {
    const authService = {
      verifySession: jest.fn().mockResolvedValue(user),
      resolveRequestUser: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<AuthService>;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(skipPhoneVerification),
    } as unknown as jest.Mocked<Reflector>;
    const bansService = {
      assertUserNotBanned: jest.fn().mockResolvedValue(undefined),
    } as any;

    return {
      guard: new PhoneWriteGuard(authService, reflector, bansService, new SiteConfigService({ get: jest.fn().mockReturnValue(profile) } as any)),
      authService,
      bansService,
    };
  }

  it('allows read requests without checking session', async () => {
    const { guard, authService } = createGuard(null);
    const { context } = createContext('GET');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.resolveRequestUser).not.toHaveBeenCalled();
  });

  it('allows explicitly skipped write routes without checking session', async () => {
    const { guard, authService } = createGuard(null, true);
    const { context } = createContext('POST');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.resolveRequestUser).not.toHaveBeenCalled();
  });

  it('rejects write requests without a session', async () => {
    const { guard } = createGuard(null);
    const { context } = createContext('POST');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects write requests for users without verified phone', async () => {
    const { guard } = createGuard({ id: 1, phone_verified: false, email_verified: true });
    const { context } = createContext('PATCH', 'session-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    await guard.canActivate(context).catch((err: ForbiddenException) => {
      expect(err.getResponse()).toMatchObject({
        code: 'PHONE_NOT_VERIFIED',
        message: '请先验证手机号后再继续操作',
      });
    });
  });

  it('allows MDTBBS writes with a verified phone even when email is unverified', async () => {
    const { guard } = createGuard({ id: 1, role: 'user', phone_verified: true, email_verified: false });
    const { context, request } = createContext('DELETE', 'session-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: 1, phone_verified: true, email_verified: false });
  });

  it('exempts administrators from email and phone verification on all writes', async () => {
    const { guard } = createGuard({ id: 1, role: 'admin', phone_verified: false, email_verified: false });
    const { context } = createContext('PUT', 'session-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows Club writes without a phone and requires a verified email', async () => {
    const { guard } = createGuard({ id: 1, phone_verified: false, email_verified: true }, false, 'mindustry-club');
    const { context } = createContext('POST', 'session-token');
    await expect(guard.canActivate(context)).resolves.toBe(true);

    const unverified = createGuard({ id: 1, phone_verified: false, email_verified: false }, false, 'mindustry-club').guard;
    const { context: unverifiedContext } = createContext('POST', 'session-token');
    await expect(unverified.canActivate(unverifiedContext)).rejects.toMatchObject({ response: { code: 'EMAIL_VERIFICATION_REQUIRED' } });
  });
});

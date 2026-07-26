jest.mock('../../modules/auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PhoneWriteGuard } from './phone-write.guard';
import type { AuthService } from '../../modules/auth/auth.service';

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
  function createGuard(user: any, skipPhoneVerification = false) {
    const authService = {
      verifySession: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<AuthService>;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(skipPhoneVerification),
    } as unknown as jest.Mocked<Reflector>;
    const bansService = {
      assertUserNotBanned: jest.fn().mockResolvedValue(undefined),
    } as any;

    return {
      guard: new PhoneWriteGuard(authService, reflector, bansService),
      authService,
      bansService,
    };
  }

  it('allows read requests without checking session', async () => {
    const { guard, authService } = createGuard(null);
    const { context } = createContext('GET');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.verifySession).not.toHaveBeenCalled();
  });

  it('allows explicitly skipped write routes without checking session', async () => {
    const { guard, authService } = createGuard(null, true);
    const { context } = createContext('POST');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.verifySession).not.toHaveBeenCalled();
  });

  it('rejects write requests without a session', async () => {
    const { guard } = createGuard(null);
    const { context } = createContext('POST');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects write requests for users without verified phone', async () => {
    const { guard } = createGuard({ id: 1, phone_verified: false });
    const { context } = createContext('PATCH', 'session-token');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    await guard.canActivate(context).catch((err: ForbiddenException) => {
      expect(err.getResponse()).toMatchObject({
        code: 'PHONE_NOT_VERIFIED',
        message: '请先验证手机号后再继续操作',
      });
    });
  });

  it('allows write requests for users with verified phone', async () => {
    const { guard } = createGuard({ id: 1, phone_verified: true });
    const { context, request } = createContext('DELETE', 'session-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: 1, phone_verified: true });
  });
});

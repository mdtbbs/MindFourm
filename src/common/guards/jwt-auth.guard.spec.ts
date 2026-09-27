jest.mock('../../modules/auth/auth.service', () => ({
  AuthService: class AuthService {},
}));

import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthService } from '../../modules/auth/auth.service';
import { SKIP_PHONE_VERIFICATION_KEY } from '../decorators/skip-phone-verification.decorator';
import { ALLOW_BANNED_USER_KEY } from '../decorators/allow-banned-user.decorator';

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

describe('JwtAuthGuard phone verification', () => {
  function createGuard(user: any, isPublic = false) {
    const authService = {
      verifySession: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<AuthService>;
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => key === 'isPublic' ? isPublic : false),
    } as unknown as jest.Mocked<Reflector>;
    const bansService = {
      assertUserNotBanned: jest.fn().mockResolvedValue(undefined),
    } as any;

    return {
      guard: new JwtAuthGuard(authService, reflector, bansService),
      authService,
      bansService,
      reflector,
    };
  }

  it('allows public routes without checking session', async () => {
    const { guard, authService } = createGuard(null, true);
    const { context } = createContext('POST');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.verifySession).not.toHaveBeenCalled();
  });

  it('rejects missing session before phone verification', async () => {
    const { guard } = createGuard(null);
    const { context } = createContext('POST');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows read requests for users without verified phone', async () => {
    const { guard } = createGuard({ id: 1, phone_verified: false });
    const { context, request } = createContext('GET', 'session-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: 1, phone_verified: false });
  });

  it('leaves write eligibility to the site verification policy guard', async () => {
    const { guard } = createGuard({ id: 1, phone_verified: false });
    const { context, request } = createContext('POST', 'session-token');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user.phone_verified).toBe(false);
  });

  it('allows write requests for users with verified phone', async () => {
    const { guard } = createGuard({ id: 1, phone_verified: true });
    const { context } = createContext('DELETE', 'session-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows an explicitly phone-verification-exempt write for an unverified user', async () => {
    const { guard } = createGuard({ id: 1, phone_verified: false });
    const { context } = createContext('POST', 'session-token');
    (guard as any).reflector.getAllAndOverride.mockImplementation((key: string) => key === SKIP_PHONE_VERIFICATION_KEY);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('allows only explicitly marked self-service reads to resolve a banned user', async () => {
    const { guard, bansService, reflector } = createGuard({ id: 1, phone_verified: true });
    const { context, request } = createContext('GET', 'session-token');
    reflector.getAllAndOverride.mockImplementation((key: string) => key === ALLOW_BANNED_USER_KEY);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: 1 });
    expect(bansService.assertUserNotBanned).not.toHaveBeenCalled();
  });
});

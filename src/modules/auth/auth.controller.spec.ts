jest.mock('./auth.service', () => ({
  AuthService: class AuthService {},
}));

import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const createController = () => {
    const phoneVerifiedAt = new Date('2026-07-29T08:00:00Z');
    const createdAt = new Date('2026-07-01T08:00:00Z');
    const syncedUser = {
      id: 7,
      mindauth_id: 123,
      username: 'test-user',
      email: 'test@example.com',
      avatar_url: '/avatar.png',
      role: 'user',
      bio: 'hello',
      phone_verified: true,
      phone_verified_at: phoneVerifiedAt,
      created_at: createdAt,
    };
    const authService = {
      checkNeedsTermsAcceptance: jest.fn().mockResolvedValue(false),
      storePendingTermsAcceptance: jest.fn(),
      exchangeCode: jest.fn().mockResolvedValue({ accessToken: 'access-token', refreshToken: 'refresh-token' }),
      getUserInfo: jest.fn().mockResolvedValue({
        id: 123,
        username: 'test-user',
        email: 'test@example.com',
        avatar_url: '',
      }),
      getOrCreateUser: jest.fn().mockResolvedValue({ id: 7 }),
      generateSessionToken: jest.fn().mockReturnValue('session-token'),
      createSession: jest.fn().mockResolvedValue(undefined),
      syncPhoneStatusFromSession: jest.fn().mockResolvedValue(syncedUser),
      configService: {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'FRONTEND_URL') return 'http://localhost:3000';
          return undefined;
        }),
      },
    };

    const req = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      cookies: { forum_session: 'forum-session' },
    };

    const res = {
      cookie: jest.fn(),
      redirect: jest.fn(),
    };

    return {
      controller: new AuthController(authService as any),
      authService,
      req,
      res,
    };
  };

  it('redirects back to the forum path carried in OAuth state', async () => {
    const { controller, req, res } = createController();

    await controller.callback('code', encodeURIComponent('/notifications'), req as any, res as any);

    expect(res.cookie).toHaveBeenCalledWith(
      'forum_session',
      'session-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/notifications');
  });

  it('falls back to the forum home page for unsafe OAuth state', async () => {
    const { controller, req, res } = createController();

    await controller.callback('code', 'https://evil.example/phish', req as any, res as any);

    expect(res.redirect).toHaveBeenCalledWith('http://localhost:3000/');
  });

  it('force-syncs phone status from the current forum session', async () => {
    const { controller, authService, req } = createController();

    const result = await controller.syncPhoneStatus(req as any);

    expect(authService.syncPhoneStatusFromSession).toHaveBeenCalledWith('forum-session');
    expect(result).toEqual({
      user: {
        id: 7,
        mindauth_id: 123,
        username: 'test-user',
        email: 'test@example.com',
        avatar_url: '/avatar.png',
        role: 'user',
        bio: 'hello',
        phone_verified: true,
        phone_verified_at: new Date('2026-07-29T08:00:00Z'),
        created_at: new Date('2026-07-01T08:00:00Z'),
      },
    });
  });

  it('ignores stale phone sync token bodies', async () => {
    const { controller, authService, req } = createController();

    await controller.syncPhoneStatus({
      ...req,
      body: { phone_sync_token: undefined },
    } as any);

    expect(authService.syncPhoneStatusFromSession).toHaveBeenCalledWith('forum-session');
  });

  it('rejects phone status sync without a forum session', async () => {
    const { controller, req } = createController();

    await expect(controller.syncPhoneStatus({ ...req, cookies: {} } as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

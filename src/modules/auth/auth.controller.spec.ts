jest.mock('./auth.service', () => ({
  AuthService: class AuthService {},
}));

import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const createController = () => {
    const authService = {
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
});

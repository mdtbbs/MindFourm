import { MobileAuthController } from './mobile-auth.controller';

describe('MobileAuthController', () => {
  it('lets an authenticated unverified user revoke only their own current session', async () => {
    const authService = { logoutMobileSession: jest.fn().mockResolvedValue(undefined) };
    const controller = new MobileAuthController(authService as any);

    await expect(controller.logout({ session_id: 'session-1' }, { user: { id: 7 } })).resolves.toEqual({ revoked: true });
    expect(authService.logoutMobileSession).toHaveBeenCalledWith(7, 'session-1');
  });
});

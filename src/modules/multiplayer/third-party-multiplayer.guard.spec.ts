import { ForbiddenException } from '@nestjs/common';
import { ThirdPartyMultiplayerGuard } from './third-party-multiplayer.guard';

describe('ThirdPartyMultiplayerGuard', () => {
  const contextFor = (authContext: any) => ({
    switchToHttp: () => ({ getRequest: () => ({ authContext }) }),
  }) as any;

  it.each(['third_party', undefined])('fails closed for OAuth clients without an approved first-party classification', async (partyType) => {
    const guard = new ThirdPartyMultiplayerGuard(
      { getBoolean: async () => false } as any,
    );

    await expect(guard.canActivate(contextFor({ source: 'mindauth_oauth', partyType, clientId: 'community-app' })))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows authorized clients with the site feature enabled without separate capability approval', async () => {
    const guard = new ThirdPartyMultiplayerGuard(
      { getBoolean: async () => true } as any,
    );

    await expect(guard.canActivate(contextFor({ source: 'mindauth_oauth', partyType: 'third_party', clientId: 'community-app' })))
      .resolves.toBe(true);
  });

  it('allows confirmed first-party OAuth clients without third-party capability checks', async () => {
    const guard = new ThirdPartyMultiplayerGuard(
      { getBoolean: async () => false } as any,
    );

    await expect(guard.canActivate(contextFor({ source: 'mindauth_oauth', partyType: 'first_party' })))
      .resolves.toBe(true);
  });
});

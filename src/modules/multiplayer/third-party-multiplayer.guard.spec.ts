import { ForbiddenException } from '@nestjs/common';
import { ThirdPartyMultiplayerGuard } from './third-party-multiplayer.guard';

describe('ThirdPartyMultiplayerGuard', () => {
  const contextFor = (authContext: any) => ({
    switchToHttp: () => ({ getRequest: () => ({ authContext }) }),
  }) as any;

  it.each(['third_party', undefined])('fails closed for OAuth clients without an approved first-party classification', async (partyType) => {
    const assertCapability = jest.fn();
    const guard = new ThirdPartyMultiplayerGuard(
      { getBoolean: async () => false } as any,
      { assertThirdPartyClientCapability: assertCapability } as any,
    );

    await expect(guard.canActivate(contextFor({ source: 'mindauth_oauth', partyType, clientId: 'community-app' })))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(assertCapability).not.toHaveBeenCalled();
  });

  it('requires the MindAuth capability approval after the site feature is enabled', async () => {
    const assertCapability = jest.fn().mockResolvedValue(undefined);
    const guard = new ThirdPartyMultiplayerGuard(
      { getBoolean: async () => true } as any,
      { assertThirdPartyClientCapability: assertCapability } as any,
    );

    await expect(guard.canActivate(contextFor({ source: 'mindauth_oauth', partyType: 'third_party', clientId: 'community-app' })))
      .resolves.toBe(true);
    expect(assertCapability).toHaveBeenCalledWith('community-app', 'supports_multiplayer');
  });

  it('allows confirmed first-party OAuth clients without third-party capability checks', async () => {
    const assertCapability = jest.fn();
    const guard = new ThirdPartyMultiplayerGuard(
      { getBoolean: async () => false } as any,
      { assertThirdPartyClientCapability: assertCapability } as any,
    );

    await expect(guard.canActivate(contextFor({ source: 'mindauth_oauth', partyType: 'first_party' })))
      .resolves.toBe(true);
    expect(assertCapability).not.toHaveBeenCalled();
  });
});

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ExternalLanLinkOAuthController } from './external-lanlink-oauth.controller';

describe('ExternalLanLinkOAuthController', () => {
  const validContext = {
    source: 'mindauth_oauth',
    clientId: process.env.LANLINK_MINDAUTH_CLIENT_ID?.trim() || 'lanlink-mindustry-mod',
    clientType: 'public',
    partyType: 'third_party',
    scopes: ['profile', 'friends.read', 'presence.read', 'presence.write', 'multiplayer.read', 'multiplayer.write'],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const validUser = {
    id: 42,
    mindauth_id: 1001,
    username: 'player',
    display_name: 'Player',
    avatar_url: 'https://example.invalid/avatar.png',
    role: 'user',
    roles: ['user'],
    phone_verified: true,
  };

  function createController(context = validContext, user = validUser) {
    const authService = {
      resolveMindAuthBearer: jest.fn().mockResolvedValue({ context, user }),
    } as any;
    const controller = new ExternalLanLinkOAuthController(authService);
    const request = { externalApiKey: { id: 7, scopes: ['lanlink:auth'] } };
    return { controller, authService, request };
  }

  it('resolves only the configured approved public client with the full LanLink scope set', async () => {
    const { controller, authService, request } = createController();
    const result = await controller.resolve({ access_token: 'opaque-mindauth-token-123456' }, request);

    expect(authService.resolveMindAuthBearer).toHaveBeenCalledWith('opaque-mindauth-token-123456');
    expect(result.expires_at).toBe(validContext.expiresAt);
    expect(result.user).toMatchObject({ id: 42, mindauth_id: '1001', username: 'player', phone_verified: true });
    expect(JSON.stringify(result)).not.toContain('access_token');
  });

  it.each([
    [{ ...validContext, clientId: 'another-client' }, validUser],
    [{ ...validContext, clientType: 'confidential' }, validUser],
    [{ ...validContext, partyType: 'unknown' }, validUser],
    [{ ...validContext, expiresAt: Math.floor(Date.now() / 1000) - 1 }, validUser],
    [validContext, { ...validUser, id: 0 }],
  ])('rejects invalid client, expired token, or incomplete local identity', async (context, user) => {
    const { controller, request } = createController(context as any, user as any);
    await expect(controller.resolve({ access_token: 'opaque-mindauth-token-123456' }, request)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects authorizations missing any scope that would be exposed by the legacy LanLink token', async () => {
    const { controller, request } = createController({
      ...validContext,
      scopes: validContext.scopes.filter((scope) => scope !== 'friends.read'),
    });
    await expect(controller.resolve({ access_token: 'opaque-mindauth-token-123456' }, request)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    [{ id: -1, scopes: ['admin:*'] }],
    [{ id: 8, scopes: ['*', 'lanlink:auth'] }],
    [{ id: 9, scopes: ['admin:*', 'lanlink:auth'] }],
    [{ id: 10, scopes: ['friends:read'] }],
  ])('rejects legacy, wildcard, admin, or missing-scope API keys', async (externalApiKey) => {
    const { controller } = createController();
    await expect(controller.resolve(
      { access_token: 'opaque-mindauth-token-123456' },
      { externalApiKey } as any,
    )).rejects.toBeInstanceOf(ForbiddenException);
  });
});

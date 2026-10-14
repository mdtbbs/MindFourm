import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ExternalLanLinkOAuthController } from './external-lanlink-oauth.controller';
import { EXTERNAL_SCOPE_KEY } from '@common/decorators/external-scope.decorator';
import { EXTERNAL_STRICT_SCOPE_KEY } from '@common/decorators/external-route-policy.decorator';

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

  it('keeps a controller-level refusal for the compatibility key that has no dedicated identity', async () => {
    // The guard already refuses wildcard grants on this route; this pins the
    // defence-in-depth check so the resolve handler cannot run with a
    // compatibility key whose id does not identify a reviewed integration.
    const { controller } = createController();
    await expect(controller.resolve(
      { access_token: 'opaque-mindauth-token-123456' },
      { externalApiKey: { id: -1, scopes: ['admin:*'] } } as any,
    )).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('derives the trusted client_id from the verified token, never from request parameters', async () => {
    // A body-supplied client_id must not influence the outcome: only the
    // introspection result of the MindAuth token decides which client is
    // allowed. Here the request claims the approved client while the token
    // belongs to another one, and the call must still be refused.
    const { controller, request } = createController({ ...validContext, clientId: 'forged-client' });
    await expect(controller.resolve(
      { access_token: 'opaque-mindauth-token-123456', client_id: 'lanlink-mindustry-mod' } as any,
      request,
    )).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('declares the strict deny-override and the exact scope on the resolve route', () => {
    // Wiring regression: the guard can only apply the deny override when the
    // handler actually carries the metadata. Removing either decorator would
    // silently re-open the route to wildcard keys.
    const handler = ExternalLanLinkOAuthController.prototype.resolve;
    expect(Reflect.getMetadata(EXTERNAL_STRICT_SCOPE_KEY, handler)).toEqual(['lanlink:auth']);
    expect(Reflect.getMetadata(EXTERNAL_SCOPE_KEY, handler)).toEqual(['lanlink:auth']);
  });
});

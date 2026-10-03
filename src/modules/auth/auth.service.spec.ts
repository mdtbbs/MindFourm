import { HttpException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService phone status sync', () => {
  const createService = () => {
    const usersRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    const redisService = {
      hgetall: jest.fn(),
      recordUserActivity: jest.fn().mockResolvedValue(undefined),
    };
    const legalAcceptanceRepository = {
      findOne: jest.fn(),
    };
    const service = new AuthService(
      usersRepository as any,
      {} as any,
      legalAcceptanceRepository as any,
      redisService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, usersRepository, redisService, legalAcceptanceRepository };
  };

  it('force-refreshes the forum user from MindAuth session tokens', async () => {
    const { service, usersRepository, redisService } = createService();
    const user = { id: 7, phone_verified: false };
    const mindauthUser = {
      id: 123,
      username: 'test-user',
      email: 'test@example.com',
      avatar_url: '/avatar.png',
      phone_verified: true,
    };
    const updated = { id: 7, phone_verified: true };
    redisService.hgetall.mockResolvedValue({
      userId: '7',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    usersRepository.findOne.mockResolvedValue(user);
    jest.spyOn(service, 'getUserInfo').mockResolvedValue(mindauthUser);
    jest.spyOn(service, 'syncMindAuthUserData').mockResolvedValue(updated as any);

    await expect(service.syncPhoneStatusFromSession('forum-session')).resolves.toBe(updated);
    expect(redisService.hgetall).toHaveBeenCalledWith('session:forum-session');
    expect(usersRepository.findOne).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(service.getUserInfo).toHaveBeenCalledWith('access-token');
    expect(service.syncMindAuthUserData).toHaveBeenCalledWith(mindauthUser);
  });

  it('refreshes an expired access token when a refresh token is available', async () => {
    const { service, usersRepository, redisService } = createService();
    const user = { id: 7, phone_verified: false };
    const mindauthUser = {
      id: 123,
      username: 'test-user',
      email: 'test@example.com',
      avatar_url: '/avatar.png',
      phone_verified: true,
    };
    const updated = { id: 7, phone_verified: true };
    redisService.hgetall.mockResolvedValue({
      userId: '7',
      accessToken: 'expired-access-token',
      refreshToken: 'refresh-token',
    });
    usersRepository.findOne.mockResolvedValue(user);
    jest.spyOn(service, 'getUserInfo')
      .mockRejectedValueOnce(new UnauthorizedException('expired'))
      .mockResolvedValueOnce(mindauthUser);
    jest.spyOn(service as any, 'refreshAccessToken').mockResolvedValue({ accessToken: 'new-access-token' });
    jest.spyOn(service, 'syncMindAuthUserData').mockResolvedValue(updated as any);

    await expect(service.syncPhoneStatusFromSession('forum-session')).resolves.toBe(updated);
    expect((service as any).refreshAccessToken).toHaveBeenCalledWith('refresh-token', 'session:forum-session');
    expect(service.getUserInfo).toHaveBeenLastCalledWith('new-access-token');
  });

  it('synchronizes email verification into the local forum user', async () => {
    const { service, usersRepository } = createService();
    const user = {
      id: 7,
      mindauth_id: 123,
      username: 'test-user',
      email: 'test@example.com',
      email_verified: false,
      phone_verified: true,
      phone_verified_at: new Date(),
      avatar_url: null,
    };
    usersRepository.findOne.mockResolvedValue(user);

    const updated = await service.syncMindAuthUserData({
      id: 123,
      email: 'test@example.com',
      email_verified: true,
      phone_verified: true,
    });

    expect(updated?.email_verified).toBe(true);
    expect(usersRepository.save).toHaveBeenCalledWith(expect.objectContaining({ email_verified: true }));
  });

  it('requires a live forum session', async () => {
    const { service, redisService } = createService();
    redisService.hgetall.mockResolvedValue({});

    await expect(service.syncPhoneStatusFromSession('missing')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires the session user to still exist', async () => {
    const { service, usersRepository, redisService } = createService();
    redisService.hgetall.mockResolvedValue({ userId: '7', accessToken: 'access-token' });
    usersRepository.findOne.mockResolvedValue(null);

    await expect(service.syncPhoneStatusFromSession('forum-session')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires MindAuth tokens in the forum session', async () => {
    const { service, usersRepository, redisService } = createService();
    redisService.hgetall.mockResolvedValue({ userId: '7' });
    usersRepository.findOne.mockResolvedValue({ id: 7, phone_verified: false });

    await expect(service.syncPhoneStatusFromSession('forum-session')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns a stable conflict when MindAuth still reports an unverified phone', async () => {
    const { service, usersRepository, redisService } = createService();
    redisService.hgetall.mockResolvedValue({ userId: '7', accessToken: 'access-token' });
    usersRepository.findOne.mockResolvedValue({ id: 7, phone_verified: false });
    jest.spyOn(service, 'getUserInfo').mockResolvedValue({
      id: 123,
      username: 'test-user',
      email: 'test@example.com',
      avatar_url: '/avatar.png',
      phone_verified: false,
    });
    jest.spyOn(service, 'syncMindAuthUserData').mockResolvedValue({ id: 7, phone_verified: false } as any);

    try {
      await service.syncPhoneStatusFromSession('forum-session');
      throw new Error('Expected sync to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'PHONE_NOT_VERIFIED_AFTER_SYNC',
      });
    }
  });
});

describe('AuthService mobile refresh concurrency contract', () => {
  it('allows exactly one concurrent rotation and revokes the family on reuse', async () => {
    const session: any = { id: 'session-a', revoked_at: null, user: { id: 7 } };
    const token: any = { id: 'r0', token_hash: 'h0', family_id: 'family-a', session_id: 'session-a', expires_at: new Date(Date.now() + 60_000), revoked_at: null, session };
    let consumeAttempts = 0;
    const refreshRepo: any = {
      findOne: jest.fn().mockResolvedValue({ ...token, session }),
      update: jest.fn(async (where: any) => where.id === 'r0' && ++consumeAttempts === 1 ? { affected: 1 } : { affected: 0 }),
      create: jest.fn((v) => v), save: jest.fn(),
    };
    const sessionRepo: any = { update: jest.fn(), findOne: jest.fn() };
    const service = new AuthService({} as any, { create: (v: any) => v, save: jest.fn() } as any, {} as any, {} as any, { get: jest.fn() } as any, {} as any, {} as any, {} as any, sessionRepo, refreshRepo, { signAsync: jest.fn() } as any);
    jest.spyOn(service as any, 'hashMobileRefreshToken').mockReturnValue('h0');
    jest.spyOn(service as any, 'issueMobileRefreshToken').mockResolvedValue({ id: 'r1', raw: 'R1' });
    jest.spyOn(service as any, 'mobileTokenResponse').mockResolvedValue({ refresh_token: 'R1' });

    const results = await Promise.allSettled([service.refreshMobileSession('R0', '127.0.0.1'), service.refreshMobileSession('R0', '127.0.0.1')]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1);
    expect(refreshRepo.update).toHaveBeenCalledWith(expect.objectContaining({ family_id: 'family-a' }), expect.objectContaining({ revoked_at: expect.any(Date) }));
    expect(sessionRepo.update).toHaveBeenCalledWith('session-a', expect.objectContaining({ revoked_at: expect.any(Date) }));
  });
});

describe('AuthService unified client principal resolver', () => {
  const createService = () => {
    const cache = new Map<string, string>();
    const redisService = {
      get: jest.fn(async (key: string) => cache.get(key) || null),
      set: jest.fn(async (key: string, value: string, _ttl?: number) => { cache.set(key, value); return 'OK'; }),
      del: jest.fn(async (key: string) => cache.delete(key) ? 1 : 0),
      recordUserActivity: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
      { findOne: jest.fn() } as any, {} as any, {} as any, redisService as any,
      { get: jest.fn() } as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any,
    );
    return { service, redisService };
  };

  it('preserves first-party forum cookie and legacy mobile JWT compatibility', async () => {
    const { service } = createService();
    const user = { id: 3 } as any;
    jest.spyOn(service, 'verifySession').mockResolvedValue(user);
    const sessionRequest: any = { cookies: { forum_session: 'session' }, headers: {} };
    await expect(service.resolveRequestUser(sessionRequest)).resolves.toBe(user);
    expect(sessionRequest.authContext).toMatchObject({ source: 'forum_session', scopes: expect.arrayContaining(['forum.read', 'forum.write']) });

    jest.spyOn(service, 'verifyMobileAccessToken').mockResolvedValue(user);
    const mobileRequest: any = { cookies: {}, headers: { authorization: 'Bearer header.payload.signature' } };
    await expect(service.resolveRequestUser(mobileRequest)).resolves.toBe(user);
    expect(mobileRequest.authContext).toMatchObject({ source: 'forum_mobile_legacy' });
  });

  it('introspects opaque MindAuth Bearers server-side and maps only explicitly issued scopes', async () => {
    const { service } = createService();
    const user = { id: 8, mindauth_id: 22, phone_verified: true } as any;
    const repository = (service as any).usersRepository;
    jest.spyOn(service as any, 'introspectMindAuthToken').mockResolvedValue({ active: true, sub: '22', client_id: 'third-party', scope: 'openid forum.read', client_type: 'public', party_type: 'third_party' });
    jest.spyOn(service, 'getUserInfo').mockResolvedValue({ id: 22, username: 'writer', email: '', avatar_url: '' });
    jest.spyOn(service, 'getOrCreateUser').mockResolvedValue(user);
    repository.findOne.mockResolvedValue(user);

    const result = await service.resolveMindAuthBearer('opaque-value');

    expect((service as any).introspectMindAuthToken).toHaveBeenCalledWith('opaque-value');
    expect(result.user).toBe(user);
    expect(result.context).toMatchObject({ source: 'mindauth_oauth', clientId: 'third-party', scopes: ['openid', 'forum.read'], clientType: 'public', partyType: 'third_party' });
  });

  it('caches introspection and userinfo for 30 seconds under a hashed bearer key', async () => {
    const { service, redisService } = createService();
    const user = { id: 8, mindauth_id: 22, phone_verified: true } as any;
    const repository = (service as any).usersRepository;
    const introspect = jest.spyOn(service as any, 'introspectMindAuthToken').mockResolvedValue({
      active: true, sub: '22', client_id: 'third-party', scope: 'profile forum.read',
      client_type: 'public', party_type: 'third_party', exp: Math.floor(Date.now() / 1000) + 300,
    });
    const userInfo = jest.spyOn(service, 'getUserInfo').mockResolvedValue({
      id: 22, username: 'writer', email: '', avatar_url: '', phone_verified: true,
    });
    repository.findOne.mockResolvedValue(user);
    jest.spyOn(service, 'getOrCreateUser').mockResolvedValue(user);
    const token = 'opaque-token-that-must-not-appear-in-redis-key';

    await service.resolveMindAuthBearer(token);
    await service.resolveMindAuthBearer(token);

    expect(introspect).toHaveBeenCalledTimes(1);
    expect(userInfo).toHaveBeenCalledTimes(1);
    const [key, value, ttl] = redisService.set.mock.calls[0];
    expect(key).toMatch(/^mindauth:oauth-introspection:[a-f0-9]{64}$/);
    expect(key).not.toContain(token);
    expect(value).not.toContain(token);
    expect(ttl).toBe(30);
  });

  it('allows profile without requiring the optional email scope for local account creation', async () => {
    const { service } = createService();
    const repository = (service as any).usersRepository;
    const user = { id: 8, mindauth_id: 22 } as any;
    jest.spyOn(service as any, 'introspectMindAuthToken').mockResolvedValue({ active: true, sub: '22', client_id: 'public-app', scope: 'profile forum.read', client_type: 'public', party_type: 'third_party' });
    jest.spyOn(service, 'getUserInfo').mockResolvedValue({ id: 22, username: 'writer', email: null, avatar_url: '' });
    repository.findOne.mockResolvedValue(null);
    jest.spyOn(service, 'getOrCreateUser').mockResolvedValue(user);

    await expect(service.resolveMindAuthBearer('opaque-value')).resolves.toMatchObject({ user });
    expect(service.getOrCreateUser).toHaveBeenCalledWith(expect.objectContaining({ id: 22, username: 'writer', email: null }));
  });

  it('requires profile scope before creating a local forum identity', async () => {
    const { service } = createService();
    const repository = (service as any).usersRepository;
    jest.spyOn(service as any, 'introspectMindAuthToken').mockResolvedValue({ active: true, sub: '22', client_id: 'public-app', scope: 'openid forum.read', client_type: 'public', party_type: 'third_party' });
    jest.spyOn(service, 'getUserInfo').mockResolvedValue({ id: 22, username: 'writer', email: null, avatar_url: '' });
    repository.findOne.mockResolvedValue(null);
    await expect(service.resolveMindAuthBearer('opaque-value')).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INSUFFICIENT_SCOPE' }) });
  });
});

describe('AuthService request and session performance', () => {
  const create = () => {
    const users = { findOne: jest.fn().mockResolvedValue({ id: 7 }) };
    const redis = { readSessionAndRenew: jest.fn().mockResolvedValue({ userId: '7' }), recordUserActivity: jest.fn().mockResolvedValue(undefined) };
    const mobile = { findOne: jest.fn(), update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sid: 'sid', sub: 7 }) };
    const auth = new AuthService(users as any, {} as any, {} as any, redis as any, { get: jest.fn() } as any, {} as any, {} as any, {} as any, mobile as any, {} as any, jwt as any);
    return { auth, users, redis, mobile };
  };

  it('shares concurrent identity resolution within one request, but checks a new request again', async () => {
    const { auth, redis } = create();
    const request = { cookies: { forum_session: 'session' }, user: { id: 999 } };
    const resolved = await Promise.all([auth.resolveRequestUser(request), auth.resolveRequestUser(request)]);
    expect(resolved).toEqual([{ id: 7 }, { id: 7 }]);
    expect(redis.readSessionAndRenew).toHaveBeenCalledTimes(1);
    expect(redis.recordUserActivity).toHaveBeenCalledTimes(1);
    redis.readSessionAndRenew.mockResolvedValue({});
    expect(await auth.resolveRequestUser({ cookies: { forum_session: 'session' } })).toBeNull();
    expect(redis.readSessionAndRenew).toHaveBeenCalledTimes(2);
  });

  it('does not query or renew a session when no credential is supplied', async () => {
    const { auth, redis, users } = create();
    expect(await auth.verifySession(undefined as any)).toBeNull();
    expect(redis.readSessionAndRenew).not.toHaveBeenCalled();
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it('reads device revocation on every access while throttling last-seen writes', async () => {
    const { auth, mobile } = create();
    mobile.findOne.mockResolvedValue({ id: 'sid', user: { id: 7 }, last_seen_at: new Date() });
    expect(await auth.verifyMobileAccessToken('token')).toEqual({ id: 7 });
    expect(mobile.update).not.toHaveBeenCalled();
    mobile.findOne.mockResolvedValue({ id: 'sid', user: { id: 7 }, last_seen_at: new Date(Date.now() - 120_000) });
    expect(await auth.verifyMobileAccessToken('token')).toEqual({ id: 7 });
    expect(mobile.update).toHaveBeenCalledTimes(1);
    mobile.findOne.mockResolvedValue(null);
    expect(await auth.verifyMobileAccessToken('token')).toBeNull();
    expect(mobile.findOne).toHaveBeenCalledTimes(3);
  });
});

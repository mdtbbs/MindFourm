import { RateLimitGuard } from './rate-limit.guard';

/**
 * The guard previously had no tests, which is how its `routeKey` design was
 * repeatedly misreported as an ID-collision bug. The first test below pins the
 * real Nest behaviour so that claim cannot resurface unverified.
 */

type RequestLike = {
  method?: string;
  url?: string;
  originalUrl?: string;
  route?: { path?: string };
  headers?: Record<string, any>;
  cookies?: Record<string, string>;
  socket?: { remoteAddress?: string };
  ip?: string;
  user?: { id?: number };
};

function createContext(request: RequestLike) {
  const response = { setHeader: jest.fn() };
  return {
    context: {
      getType: () => 'http',
      getHandler: () => ({ name: 'handler' }),
      getClass: () => ({ name: 'TestController' }),
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any,
    response,
  };
}

function createGuard(overrides: { current?: number; internalKey?: string } = {}) {
  const evalFn = jest.fn(async () => overrides.current ?? 1);

  const redis = { eval: evalFn } as any;
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(undefined),
  } as any;
  const config = {
    get: jest.fn((key: string) => (key === 'app.internalApiKey' ? overrides.internalKey : undefined)),
  } as any;
  const telemetry = { recordBlocked: jest.fn() } as any;

  return { guard: new RateLimitGuard(redis, reflector, config, telemetry), evalFn, telemetry };
}

describe('RateLimitGuard', () => {
  it('keys buckets by the full Nest route path so different controllers never collide', async () => {
    const { guard, evalFn } = createGuard();

    // Nest puts the complete controller+handler path (including the global
    // prefix) on req.route.path - NOT the bare relative handler segment.
    const { context } = createContext({
      method: 'GET',
      route: { path: '/api/v1/threads/:id' },
      url: '/api/v1/threads/42',
      originalUrl: '/api/v1/threads/42',
      headers: {},
      cookies: {},
    });
    await guard.canActivate(context);
    const threadsKey = evalFn.mock.calls[0][1][0];

    const { context: context2 } = createContext({
      method: 'GET',
      route: { path: '/api/posts/:id' },
      url: '/api/posts/42',
      originalUrl: '/api/posts/42',
      headers: {},
      cookies: {},
    });
    await guard.canActivate(context2);
    const postsKey = evalFn.mock.calls[1][1][0];

    expect(threadsKey).toContain('/api/v1/threads/:id');
    expect(postsKey).toContain('/api/posts/:id');
    expect(threadsKey).not.toEqual(postsKey);
  });

  it('falls back to controller.handler when no route path is resolved', async () => {
    const { guard, evalFn } = createGuard();
    const { context } = createContext({ method: 'GET', headers: {}, cookies: {} });
    await guard.canActivate(context);
    expect(evalFn.mock.calls[0][1][0]).toContain('TestController.handler');
  });

  it('throws a RATE_LIMITED HttpException with code on both V1 and legacy paths', async () => {
    // 5000 exceeds the default read ceiling (1200/min) for an IP identity.
    const { guard, telemetry } = createGuard({ current: 5000 });

    for (const url of ['/api/v1/threads', '/api/posts']) {
      const { context, response } = createContext({
        method: 'GET', headers: {}, cookies: {}, url, originalUrl: url,
        route: { path: url },
      });
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: 429,
        response: { code: 'RATE_LIMITED' },
      });
      expect(response.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    }
    expect(telemetry.recordBlocked).toHaveBeenCalledTimes(2);
  });

  it('trusts requests bearing the internal key without touching Redis', async () => {
    const { guard, evalFn } = createGuard({ internalKey: 'internal-secret' });
    const { context } = createContext({
      method: 'GET',
      headers: { 'x-forum-internal-key': 'internal-secret' },
      cookies: {},
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(evalFn).not.toHaveBeenCalled();
  });

  it('fails open when Redis throws, so an outage cannot take the site down', async () => {
    const evalFn = jest.fn(async () => { throw new Error('redis down'); });
    const guard = new RateLimitGuard(
      { eval: evalFn } as any,
      { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as any,
      { get: jest.fn() } as any,
      { recordBlocked: jest.fn() } as any,
    );
    const { context } = createContext({ method: 'GET', headers: {}, cookies: {} });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

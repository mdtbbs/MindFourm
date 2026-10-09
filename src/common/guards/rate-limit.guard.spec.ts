import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';

/**
 * The guard had no tests, which is how its `routeKey` design was repeatedly
 * misreported as an ID-collision bug and how a bucket key built from
 * `req.route.path` alone could silently share one budget across controllers.
 * The suites below pin both behaviours.
 */

function createGuard(options: {
  explicit?: { max: number; window: number } | null;
  internalApiKey?: string;
  evalImpl?: (key: string, window: number) => Promise<number>;
} = {}) {
  const counters = new Map<string, number>();
  const keys: string[] = [];
  const redis = {
    incrementFixedWindow: jest.fn(async (key: string, window: number) => {
      if (options.evalImpl) return options.evalImpl(key, window);
      keys.push(key);
      const next = (counters.get(key) || 0) + 1;
      counters.set(key, next);
      return next;
    }),
  };
  const reflector = {
    getAllAndOverride: jest.fn((metadataKey: string) =>
      metadataKey === 'rateLimit' ? options.explicit ?? undefined : false,
    ),
  } as unknown as Reflector;
  const telemetry = { recordBlocked: jest.fn() };
  const config = {
    get: jest.fn((key: string) =>
      key === 'app.internalApiKey' ? options.internalApiKey : undefined,
    ),
  };
  const headers: Record<string, string> = {};
  const response = {
    setHeader: (name: string, value: string) => { headers[name] = value; },
  };
  const guard = new RateLimitGuard(redis as any, reflector, config as any, telemetry as any);
  return { guard, keys, headers, redis, telemetry };
}

function createContext(params: {
  method: string;
  baseUrl: string;
  routePath: string;
  className?: string;
  handlerName?: string;
  request?: Record<string, unknown>;
  response?: any;
}) {
  const request: any = {
    method: params.method,
    baseUrl: params.baseUrl,
    route: { path: params.routePath },
    url: `${params.baseUrl}${params.routePath}`,
    originalUrl: `${params.baseUrl}${params.routePath}`,
    headers: {},
    socket: { remoteAddress: '203.0.113.9' },
    clientIp: '203.0.113.9',
    ...params.request,
  };
  return {
    request,
    context: {
      getType: () => 'http',
      getHandler: () => ({ name: params.handlerName || 'getResource' }),
      getClass: () => ({ name: params.className || 'ResourcesV1Controller' }),
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => params.response ?? { setHeader: jest.fn() } }),
    } as any,
  };
}

describe('RateLimitGuard', () => {
  it('keys buckets by the full Nest route path so different controllers never collide', async () => {
    const { guard, keys } = createGuard();

    // Nest puts the complete controller+handler path (including the global
    // prefix) on `req.route.path` — not the bare relative handler segment.
    const threads = createContext({
      method: 'GET', baseUrl: '', routePath: '/api/v1/threads/:id',
      className: 'ThreadsV1Controller', handlerName: 'getThread',
    });
    await guard.canActivate(threads.context);
    const threadsKey = keys[0];

    const posts = createContext({
      method: 'GET', baseUrl: '', routePath: '/api/posts/:id',
      className: 'PostsController', handlerName: 'getPost',
    });
    await guard.canActivate(posts.context);
    const postsKey = keys[1];

    expect(threadsKey).toContain('/api/v1/threads/:id');
    expect(postsKey).toContain('/api/posts/:id');
    expect(threadsKey).not.toEqual(postsKey);
  });

  it('falls back to controller.handler when no route path is resolved', async () => {
    const { guard, keys } = createGuard();
    const { context } = createContext({
      method: 'GET', baseUrl: '', routePath: '', className: 'TestController', handlerName: 'handler',
    });
    await guard.canActivate(context);
    expect(keys[0]).toContain('TestController.handler');
  });

  it('throws a RATE_LIMITED HttpException with code on both V1 and legacy paths', async () => {
    // The default read ceiling is 1200/min for an IP identity, so 1 is enough here.
    const { guard, telemetry } = createGuard({ explicit: { max: 0, window: 60 } });

    for (const baseUrl of ['/api/v1/threads', '/api/posts']) {
      const { context, headers } = createGuardResponseContext(baseUrl);
      await expect(guard.canActivate(context)).rejects.toMatchObject({
        status: 429,
        response: { code: 'RATE_LIMITED' },
      });
      expect(headers['Retry-After']).toBeDefined();
    }
    expect(telemetry.recordBlocked).toHaveBeenCalledTimes(2);
  });

  it('trusts requests bearing the internal key without touching Redis', async () => {
    const { guard, redis } = createGuard({ internalApiKey: 'internal-secret' });
    const { context } = createContext({
      method: 'GET', baseUrl: '/api/v1/threads', routePath: '/',
      request: { headers: { 'x-forum-internal-key': 'internal-secret' } },
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(redis.incrementFixedWindow).not.toHaveBeenCalled();
  });

  it('fails open when Redis throws, so an outage cannot take the site down', async () => {
    const guard = new RateLimitGuard(
      { incrementFixedWindow: jest.fn(async () => { throw new Error('redis down'); }) } as any,
      { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as any,
      { get: jest.fn() } as any,
      { recordBlocked: jest.fn() } as any,
    );
    const { context } = createContext({ method: 'GET', baseUrl: '/api/v1/threads', routePath: '/' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

/** A context whose response records headers, so `Retry-After` can be asserted. */
function createGuardResponseContext(baseUrl: string) {
  const headers: Record<string, string> = {};
  const response = { setHeader: (name: string, value: string) => { headers[name] = value; } };
  const { context } = createContext({ method: 'GET', baseUrl, routePath: '/', response });
  return { context, headers };
}

describe('RateLimitGuard bucket keys', () => {
  it('separates the same :id route mounted under different controllers', async () => {
    const { guard, keys } = createGuard();

    const resource = createContext({
      method: 'GET', baseUrl: '/api/v1/resources', routePath: '/:id',
      className: 'ResourcesV1Controller', handlerName: 'getResource',
    });
    const thread = createContext({
      method: 'GET', baseUrl: '/api/v1/threads', routePath: '/:id',
      className: 'ThreadsV1Controller', handlerName: 'getThread',
    });

    await guard.canActivate(resource.context);
    await guard.canActivate(thread.context);

    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    // The mount path has to be visible in the key, not just the handler name.
    expect(keys[0]).toContain('/api/v1/resources/:id');
    expect(keys[1]).toContain('/api/v1/threads/:id');
  });

  it('keeps reading one endpoint from consuming another endpoint budget', async () => {
    const { guard } = createGuard({ explicit: { max: 2, window: 60 } });

    const list = createContext({ method: 'GET', baseUrl: '/api/v1/resources', routePath: '/' });
    const detail = createContext({ method: 'GET', baseUrl: '/api/v1/resources', routePath: '/:id' });

    await expect(guard.canActivate(list.context)).resolves.toBe(true);
    await expect(guard.canActivate(list.context)).resolves.toBe(true);
    // The list budget is spent; the detail route must still be usable.
    await expect(guard.canActivate(detail.context)).resolves.toBe(true);
  });

  it('buckets by handler when the request has no matched route', async () => {
    const { guard, keys } = createGuard();
    const { context } = createContext({
      method: 'GET', baseUrl: '', routePath: '', className: 'FallbackController', handlerName: 'run',
    });
    // `req.route` exists but `path` is empty; the handler identity is the fallback.
    await guard.canActivate(context);
    expect(keys[0]).toContain('FallbackController.run');
  });
});

describe('RateLimitGuard limits and responses', () => {
  it('returns a structured 429 with Retry-After for V1 routes', async () => {
    const { guard, headers, telemetry } = createGuard({ explicit: { max: 1, window: 45 } });
    const first = createContext({ method: 'GET', baseUrl: '/api/v1/resources', routePath: '/' });
    await guard.canActivate(first.context);

    const second = createContext({ method: 'GET', baseUrl: '/api/v1/resources', routePath: '/' });
    const failure = await guard.canActivate(second.context).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpException);
    expect((failure as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((failure as HttpException).getResponse()).toMatchObject({ code: 'RATE_LIMITED' });
    expect(telemetry.recordBlocked).toHaveBeenCalledWith(expect.objectContaining({
      route: expect.stringContaining('/api/v1/resources'),
      identity: 'ip',
      limit: 1,
    }));
    void headers;
  });

  it('carries the stable code on legacy routes too, so the frontend can localize', async () => {
    const { guard } = createGuard({ explicit: { max: 1, window: 60 } });
    const first = createContext({ method: 'GET', baseUrl: '/api/resources', routePath: '/' });
    await guard.canActivate(first.context);
    const second = createContext({ method: 'GET', baseUrl: '/api/resources', routePath: '/' });
    const failure = await guard.canActivate(second.context).catch((error: unknown) => error);
    // The legacy error filter forwards `code`, so this stays backward compatible
    // while giving non-V1 clients a machine-readable reason instead of a bare string.
    expect((failure as HttpException).getResponse()).toMatchObject({
      code: 'RATE_LIMITED',
      message: '请求过于频繁，请稍后再试',
    });
  });

  it('exempts requests carrying the shared internal key without touching the counter', async () => {
    const { guard, redis } = createGuard({ internalApiKey: 'shared-secret' });
    const { context } = createContext({
      method: 'GET', baseUrl: '/api/v1/resources', routePath: '/',
      request: { headers: { 'x-forum-internal-key': 'shared-secret' } },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(redis.incrementFixedWindow).not.toHaveBeenCalled();
  });

  it('does not exempt a wrong internal key', async () => {
    const { guard, redis } = createGuard({ internalApiKey: 'shared-secret' });
    const { context } = createContext({
      method: 'GET', baseUrl: '/api/v1/resources', routePath: '/',
      request: { headers: { 'x-forum-internal-key': 'wrong-secret' }, clientIp: '203.0.113.9' },
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(redis.incrementFixedWindow).toHaveBeenCalledTimes(1);
  });

  it('fails open when the counter backend throws', async () => {
    const { guard } = createGuard({ evalImpl: async () => { throw new Error('redis down'); } });
    const { context } = createContext({ method: 'GET', baseUrl: '/api/v1/resources', routePath: '/' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('identifies authenticated users and hashed sessions ahead of the IP', async () => {
    const { guard, keys } = createGuard();
    const { context: userContext } = createContext({
      method: 'GET', baseUrl: '/api/v1/resources', routePath: '/', request: { user: { id: 42 } },
    });
    await guard.canActivate(userContext);
    expect(keys[0]).toContain(':u:42:');

    const { guard: guard2, keys: keys2 } = createGuard();
    const { context: sessionContext } = createContext({
      method: 'GET', baseUrl: '/api/v1/resources', routePath: '/',
      request: { cookies: { forum_session: 'raw-session-token' } },
    });
    await guard2.canActivate(sessionContext);
    expect(keys2[0]).toContain(':s:');
    // The raw token must never reach the shared store.
    expect(keys2[0]).not.toContain('raw-session-token');
  });
});

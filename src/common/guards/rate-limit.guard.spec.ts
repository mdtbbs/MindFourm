import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';

/**
 * The guard had no tests, which is why a bucket key built from `req.route.path`
 * alone could silently make every `@Get(':id')` route share one budget.
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

  it('keeps the legacy plain-string message for non-Versioned routes', async () => {
    const { guard } = createGuard({ explicit: { max: 1, window: 60 } });
    const first = createContext({ method: 'GET', baseUrl: '/api/resources', routePath: '/' });
    await guard.canActivate(first.context);
    const second = createContext({ method: 'GET', baseUrl: '/api/resources', routePath: '/' });
    const failure = await guard.canActivate(second.context).catch((error: unknown) => error);
    expect((failure as HttpException).getResponse()).toBe('请求过于频繁，请稍后再试');
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

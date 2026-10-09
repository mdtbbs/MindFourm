import { createRateLimitMiddleware } from './simple-rate-limiter';

function createReqRes(ip = '203.0.113.9') {
  const headers: Record<string, any> = {};
  const req: any = { headers: {}, ip, socket: { remoteAddress: ip } };
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    setHeader: (k: string, v: string) => { headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
    headers,
  };
  return { req, res };
}

describe('createRateLimitMiddleware', () => {
  it('allows requests up to the limit and blocks the next one with 429', () => {
    const middleware = createRateLimitMiddleware({ max: 2, windowMs: 60_000 });

    for (let i = 0; i < 2; i += 1) {
      const { req, res } = createReqRes();
      const next = jest.fn();
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200);
    }

    const { req, res } = createReqRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ error: { code: 'RATE_LIMITED' } });
    expect(res.headers['Retry-After']).toBeDefined();
  });

  it('counts each client IP independently', () => {
    const middleware = createRateLimitMiddleware({ max: 1, windowMs: 60_000 });

    const first = createReqRes('198.51.100.1');
    middleware(first.req, first.res, jest.fn());
    const second = createReqRes('198.51.100.2');
    const next = jest.fn();
    middleware(second.req, second.res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(second.res.statusCode).toBe(200);
  });
});

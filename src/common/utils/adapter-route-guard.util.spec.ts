import { AdapterRouteGuard } from './adapter-route-guard.util';
import { SharedBudget } from './shared-budget.util';

function createResponse() {
  const headers: Record<string, string> = {};
  const response: any = {
    headers,
    statusCode: 0,
    body: undefined as unknown,
    setHeader(name: string, value: string) { headers[name] = value; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  return response;
}

describe('SharedBudget', () => {
  it('allows up to the limit and then reports a retry delay', () => {
    let now = 0;
    const budget = new SharedBudget(2, 60_000, () => now);

    expect(budget.consume('ip:1').allowed).toBe(true);
    expect(budget.consume('ip:1').allowed).toBe(true);
    expect(budget.consume('ip:1')).toEqual({ allowed: false, retryAfterSeconds: 60 });

    now = 60_001;
    expect(budget.consume('ip:1').allowed).toBe(true);
  });

  it('tracks identities independently', () => {
    const budget = new SharedBudget(1, 60_000, () => 0);
    expect(budget.consume('ip:1').allowed).toBe(true);
    expect(budget.consume('ip:1').allowed).toBe(false);
    expect(budget.consume('ip:2').allowed).toBe(true);
  });
});

describe('AdapterRouteGuard', () => {
  it('refuses writer methods without consuming the budget', () => {
    const guard = new AdapterRouteGuard(new SharedBudget(1, 60_000, () => 0), () => '');
    const response = createResponse();

    expect(guard.check({ method: 'POST', clientIp: '203.0.113.4' }, response)).toBe(false);
    expect(response.statusCode).toBe(405);
    expect(response.headers['Cache-Control']).toBe('no-store');

    // A GET from the same caller still has its full budget.
    expect(guard.check({ method: 'GET', clientIp: '203.0.113.4' }, createResponse())).toBe(true);
  });

  it('answers 429 once the per-client budget is spent', () => {
    const guard = new AdapterRouteGuard(new SharedBudget(1, 30_000, () => 0), () => '');
    const request = { method: 'GET', clientIp: '203.0.113.4' };

    expect(guard.check(request, createResponse())).toBe(true);
    const response = createResponse();
    expect(guard.check(request, response)).toBe(false);
    expect(response.statusCode).toBe(429);
    expect(response.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(response.headers['Retry-After']).toBe('30');
  });

  it('exempts callers presenting the shared internal key', () => {
    const guard = new AdapterRouteGuard(new SharedBudget(1, 60_000, () => 0), () => 'shared-secret');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(guard.check({
        method: 'GET',
        headers: { 'x-forum-internal-key': 'shared-secret' },
        socket: { remoteAddress: '10.0.0.5' },
      }, createResponse())).toBe(true);
    }

    // A wrong key is an ordinary client, not an internal caller: it gets whatever
    // budget is left, which for this fresh client is still the full allowance.
    const wrongKey = createResponse();
    expect(guard.check({
      method: 'GET',
      headers: { 'x-forum-internal-key': 'wrong' },
      socket: { remoteAddress: '10.0.0.5' },
    }, wrongKey)).toBe(true);
    expect(guard.check({
      method: 'GET',
      headers: { 'x-forum-internal-key': 'wrong' },
      socket: { remoteAddress: '10.0.0.5' },
    }, createResponse())).toBe(false);
  });

  it('prefers the middleware-resolved client address over the raw socket peer', () => {
    const budget = new SharedBudget(1, 60_000, () => 0);
    const guard = new AdapterRouteGuard(budget, () => '');

    expect(guard.check({ method: 'GET', clientIp: '198.51.100.7', socket: { remoteAddress: '10.0.0.5' } }, createResponse())).toBe(true);
    // Same header-derived address, different peer: still the same bucket.
    expect(guard.check({ method: 'GET', clientIp: '198.51.100.7', socket: { remoteAddress: '10.0.0.9' } }, createResponse())).toBe(false);
    // A different visitor is unaffected.
    expect(guard.check({ method: 'GET', clientIp: '198.51.100.8' }, createResponse())).toBe(true);
  });
});

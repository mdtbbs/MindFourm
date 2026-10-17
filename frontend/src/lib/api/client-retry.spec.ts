import { settingsApi, resetApiCache } from './client';

/**
 * The read-retry policy is the difference between absorbing a brief 503 and
 * amplifying it: three immediate retries in lockstep made every client retry at
 * the same moment against an already-overloaded origin.
 */
describe('read retry and 429 handling', () => {
  const originalFetch = global.fetch;
  const send = jest.fn();
  let randomSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    resetApiCache();
    send.mockReset();
    global.fetch = send as unknown as typeof fetch;
    // Deterministic jitter: `Math.random()` returns the ceiling of the backoff.
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(1);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    randomSpy.mockRestore();
    global.fetch = originalFetch;
  });

  function okResponse(body: unknown = { success: true, data: {} }) {
    return { status: 200, ok: true, json: async () => body, headers: { get: () => null } };
  }

  function errorResponse(status: number, headers: Record<string, string> = {}, body: unknown = {}) {
    return { status, ok: false, json: async () => body, headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } };
  }

  async function runWithTimers(promise: Promise<unknown>) {
    // Advance the fake clock while allowing the awaited delays to resolve.
    const settled = promise.then((value) => ({ value }), (error) => ({ error }));
    for (let step = 0; step < 12; step += 1) {
      await Promise.resolve();
      jest.runOnlyPendingTimers();
    }
    return Promise.race([settled, Promise.resolve({ error: new Error('did not settle') })]);
  }

  it('retries a 503 read with an increasing delay and eventually succeeds', async () => {
    send
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse({ success: true, data: { site_name: 'x' } }));

    const result = await runWithTimers(settingsApi.get());
    expect(result).toMatchObject({ value: { site_name: 'x' } });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('waits the Retry-After duration instead of the computed backoff', async () => {
    send
      .mockResolvedValueOnce(errorResponse(503, { 'retry-after': '2' }))
      .mockResolvedValueOnce(okResponse({ success: true, data: { site_name: 'ok' } }));

    const settled = settingsApi.get().then((value) => ({ value }), (error) => ({ error }));
    // Let the first fetch resolve and the retry be scheduled.
    for (let step = 0; step < 6; step += 1) { await Promise.resolve(); }

    // The computed first backoff would be 250ms; the server asked for 2s.
    jest.advanceTimersByTime(250);
    for (let step = 0; step < 6; step += 1) { await Promise.resolve(); }
    expect(send).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1_750);
    for (let step = 0; step < 6; step += 1) { await Promise.resolve(); }
    expect(send).toHaveBeenCalledTimes(2);
    await expect(settled).resolves.toMatchObject({ value: { site_name: 'ok' } });
  });

  it('does not retry a mutation, even on a retryable status', async () => {
    const { authApi } = await import('./client');
    send.mockResolvedValue(errorResponse(503, { 'retry-after': '1' }, { message: '服务暂不可用' }));

    const failure = await authApi.syncPhoneStatus().catch((error: unknown) => error as any);
    expect(failure.status).toBe(503);
    // Writes are attempted exactly once: an interrupted mutation may already have
    // reached the origin.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('surfaces Retry-After seconds on a 429 failure', async () => {
    send.mockResolvedValue(errorResponse(429, { 'retry-after': '30' }, { error: { code: 'RATE_LIMITED', message: 'RATE_LIMITED' } }));
    const failure = await settingsApi.get().catch((error: unknown) => error as any);
    expect(failure.status).toBe(429);
    expect(failure.retryAfterSeconds).toBe(30);
    // 429 is not in the retryable set: it is a decision, not a transient fault.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('leaves retryAfterSeconds undefined when the header is absent or unparsable', async () => {
    send.mockResolvedValue(errorResponse(429, { 'retry-after': 'later' }, { error: { code: 'RATE_LIMITED', message: '慢一点' } }));
    const failure = await settingsApi.get().catch((error: unknown) => error as any);
    expect(failure.status).toBe(429);
    expect(failure.retryAfterSeconds).toBeUndefined();
  });
});

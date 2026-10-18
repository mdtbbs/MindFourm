import { ResourceStorageClientService, ResourceStorageClientError } from './resource-storage-client.service';

/**
 * A RES that is merely slow used to make every resource request wait out the
 * timeout and then answer 503. These cover the circuit that converts that into a
 * short, explicit failure.
 */
function create(config: Record<string, unknown> = {}, now: () => number = () => Date.now()) {
  const configService = {
    get: jest.fn((key: string) => ({
      'res.baseUrl': 'https://res.example.test',
      'res.apiKey': 'key',
      'res.enabled': true,
      ...config,
    } as Record<string, unknown>)[key]),
  };
  const service = new ResourceStorageClientService(configService as any, undefined, { now });
  return { service, configService };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    body: { cancel: async () => undefined },
  } as unknown as Response;
}

const OBJECT = {
  id: 'o1', public_id: 'p1', sha256: 'a'.repeat(64), size_bytes: 1,
  mime_type: 'application/octet-stream', original_filename: 'f.msch',
  state: 'ready', created_at: '', verified_at: null,
};

describe('ResourceStorageClientService circuit breaker', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('reports availability from configuration alone', () => {
    const { service } = create();
    expect(service.isAvailable).toBe(true);
    expect(service.isReachable).toBe(true);
  });

  it('stays unavailable when the dependency is not configured', () => {
    const { service } = create({ 'res.enabled': false });
    expect(service.isAvailable).toBe(false);
    expect(service.isReachable).toBe(false);
  });

  it('stops calling a failing dependency after the threshold', async () => {
    let now = 0;
    const { service } = create({ 'res.circuitFailureThreshold': 2 }, () => now);
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNRESET'));

    await expect(service.getObject('p1')).rejects.toBeInstanceOf(ResourceStorageClientError);
    await expect(service.getObject('p1')).rejects.toBeInstanceOf(ResourceStorageClientError);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(service.isReachable).toBe(false);

    // Open circuit: the third call must fail fast without another network attempt.
    const failure = await service.getObject('p1').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ResourceStorageClientError);
    expect((failure as ResourceStorageClientError).code).toBe('unavailable');
    expect((failure as ResourceStorageClientError).retryAfterSeconds).toBe(15);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('closes the circuit again after the cooldown and on success', async () => {
    let now = 0;
    const { service } = create({ 'res.circuitFailureThreshold': 1, 'res.circuitCooldownMs': 5_000 }, () => now);
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(service.getObject('p1')).rejects.toBeInstanceOf(ResourceStorageClientError);
    expect(service.isReachable).toBe(false);

    now = 5_001;
    expect(service.isReachable).toBe(true);
    fetchSpy.mockResolvedValueOnce(jsonResponse({ object: OBJECT }));
    await expect(service.getObject('p1')).resolves.toMatchObject({ public_id: 'p1' });
    expect(service.retryAfterSeconds).toBe(0);
  });

  it('counts a 5xx from the dependency as a failure but not a 4xx', async () => {
    let now = 0;
    const { service } = create({ 'res.circuitFailureThreshold': 1 }, () => now);
    const fetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({}, 503));

    await expect(service.getObject('missing')).rejects.toBeInstanceOf(ResourceStorageClientError);
    expect(service.isReachable).toBe(true);

    await expect(service.getObject('p1')).rejects.toBeInstanceOf(ResourceStorageClientError);
    expect(service.isReachable).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('advertises the cooldown in Retry-After metadata when the circuit is open', async () => {
    let now = 0;
    const { service } = create({ 'res.circuitFailureThreshold': 1, 'res.circuitCooldownMs': 30_000 }, () => now);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));

    await expect(service.getObject('p1')).rejects.toBeInstanceOf(ResourceStorageClientError);
    const failure = await service.getObject('p1').catch((error: unknown) => error as ResourceStorageClientError);
    expect(failure.retryAfterSeconds).toBe(30);
    expect(failure.getStatus()).toBe(503);
  });
});

describe('ResourceStorageClientService binary reads', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  function delayedBody(signal: AbortSignal, delay?: number): Response {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return new Response(new ReadableStream({
      start(controller) {
        const abort = () => { clearTimeout(timer); controller.error(signal.reason); };
        signal.addEventListener('abort', abort, { once: true });
        if (delay !== undefined) timer = setTimeout(() => {
          signal.removeEventListener('abort', abort);
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        }, delay);
      },
      cancel() { clearTimeout(timer); },
    }));
  }

  it('reads a body beyond the metadata deadline using the binary transfer budget', async () => {
    const { service } = create({ 'res.requestTimeoutMs': 5, 'res.downloadTimeoutMs': 1_000 });
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => delayedBody(init!.signal!, 30));
    await expect(service.getObjectContent('p1')).resolves.toEqual(Buffer.from([1, 2, 3]));
  });

  it('maps a timeout after headers to a retryable 503 and releases the reader', async () => {
    const { service } = create({ 'res.requestTimeoutMs': 5, 'res.downloadTimeoutMs': 25 });
    let cancel: jest.SpyInstance;
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const response = delayedBody(init!.signal!);
      const reader = response.body!.getReader();
      cancel = jest.spyOn(reader, 'cancel');
      jest.spyOn(response.body!, 'getReader').mockReturnValue(reader as any);
      return response;
    });
    const error = await service.getObjectContent('p1').catch((failure) => failure);
    expect(error).toBeInstanceOf(ResourceStorageClientError);
    expect(error.code).toBe('timeout');
    expect(error.getStatus()).toBe(503);
    expect(cancel!).toHaveBeenCalled();
  });

  it('counts repeated body failures even when each response has successful headers', async () => {
    const { service } = create({ 'res.circuitFailureThreshold': 2 });
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(new ReadableStream({
      start(controller) { controller.error(new Error('connection reset during body')); },
    })));
    await expect(service.getObjectContent('p1')).rejects.toMatchObject({ code: 'unavailable' });
    await expect(service.getObjectContent('p1')).rejects.toMatchObject({ code: 'unavailable', retryAfterSeconds: 15 });
    expect(service.isReachable).toBe(false);
    await expect(service.getObjectContent('p1')).rejects.toBeInstanceOf(ResourceStorageClientError);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('still rejects oversized bytes without treating them as a dependency outage', async () => {
    const { service } = create({ 'res.circuitFailureThreshold': 1 });
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    await expect(service.getObjectContent('p1', { maxBytes: 2 })).rejects.toMatchObject({ code: 'rejected' });
    expect(service.isReachable).toBe(true);
  });
});

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

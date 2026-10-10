jest.mock('../../database/redis.service', () => ({ RedisService: class RedisService {} }));

import { CspReportsService } from './csp-reports.service';

function createService() {
  const redis = {
    hIncrBy: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  };
  const service = new CspReportsService(redis as any);
  return { service, redis };
}

const wrapped = (report: unknown) => ({ 'csp-report': report });

function callsOf(redis: { hIncrBy: jest.Mock }) {
  return redis.hIncrBy.mock.calls.map(([key, field, amount]) => ({ key, field, amount }));
}

describe('CspReportsService.record', () => {
  it('records a bare report object', async () => {
    const { service, redis } = createService();

    await service.record({ 'violated-directive': 'script-src' });

    expect(callsOf(redis)).toEqual([
      { key: expect.any(String), field: 'directive:script-src', amount: 1 },
      { key: expect.any(String), field: 'total', amount: 1 },
    ]);
  });

  it('unwraps a single csp-report envelope', async () => {
    const { service, redis } = createService();

    await service.record(wrapped({ 'violated-directive': 'img-src' }));

    expect(redis.hIncrBy).toHaveBeenCalledWith(expect.any(String), 'directive:img-src', 1);
    expect(redis.hIncrBy).toHaveBeenCalledWith(expect.any(String), 'total', 1);
  });

  it('records every report of a batched payload into one key', async () => {
    const { service, redis } = createService();

    await service.record([
      wrapped({ 'violated-directive': 'script-src' }),
      wrapped({ 'violated-directive': 'style-src' }),
    ]);

    expect(redis.hIncrBy).toHaveBeenCalledTimes(4);
    const keys = new Set(callsOf(redis).map((c) => c.key));
    expect(keys.size).toBe(1);
    expect(callsOf(redis).map((c) => c.field)).toEqual([
      'directive:script-src',
      'total',
      'directive:style-src',
      'total',
    ]);
    expect(callsOf(redis).filter((c) => c.field === 'total').length).toBe(2);
  });

  it('uses the hour-bucketed csp:reports:<YYYYMMDDHH> key', async () => {
    const { service, redis } = createService();

    await service.record({ 'violated-directive': 'script-src' });

    const expectedKey = `csp:reports:${new Date()
      .toISOString()
      .slice(0, 13)
      .replace(/[-T:]/g, '')}`;
    expect(callsOf(redis).every((c) => c.key === expectedKey)).toBe(true);
    expect(redis.expire).toHaveBeenCalledWith(expectedKey, 93600);
  });

  it('parses an array payload without an envelope', async () => {
    const { service, redis } = createService();

    await service.record([{ 'violated-directive': 'connect-src' }]);

    expect(redis.hIncrBy).toHaveBeenCalledWith(
      expect.any(String),
      'directive:connect-src',
      1,
    );
  });

  it('counts only the first 20 reports of a large payload', async () => {
    const { service, redis } = createService();
    const payload = Array.from({ length: 25 }, (_, i) =>
      wrapped({ 'violated-directive': `d${i}` }),
    );

    await service.record(payload);

    const fields = callsOf(redis).map((c) => c.field);
    expect(fields.length).toBe(40);
    expect(fields.filter((f) => f === 'total').length).toBe(20);
    expect(fields).toContain('directive:d19');
    expect(fields).not.toContain('directive:d20');
    expect(fields).not.toContain('directive:d24');
  });
});

describe('CspReportsService directive sanitization', () => {
  it('strips everything outside [a-z0-9-] from the directive name', async () => {
    const { service, redis } = createService();

    await service.record(
      wrapped({ 'violated-directive': "script-src 'self' https://evil.example/?a=1" }),
    );

    expect(redis.hIncrBy).toHaveBeenCalledWith(
      expect.any(String),
      'directive:script-srcselfhttpsevilexamplea1',
      1,
    );
  });

  it('truncates a directive to 80 characters', async () => {
    const { service, redis } = createService();

    await service.record(wrapped({ 'violated-directive': 'a'.repeat(120) }));

    const field = callsOf(redis)[0].field;
    expect(field).toBe(`directive:${'a'.repeat(80)}`);
    expect(field.length).toBe('directive:'.length + 80);
  });

  it('truncates after stripping, not before', async () => {
    const { service, redis } = createService();

    await service.record(wrapped({ 'violated-directive': `${"'".repeat(50)}${'b'.repeat(100)}` }));

    expect(callsOf(redis)[0].field).toBe(`directive:${'b'.repeat(80)}`);
  });

  it('falls back to unknown when nothing is left after cleaning', async () => {
    const { service, redis } = createService();

    await service.record(wrapped({ 'violated-directive': "'!?*()'" }));

    expect(redis.hIncrBy).toHaveBeenCalledWith(expect.any(String), 'directive:unknown', 1);
  });

  it('falls back to unknown for a report without a directive', async () => {
    const { service, redis } = createService();

    await service.record(wrapped({ 'document-uri': 'https://example.com/' }));

    expect(redis.hIncrBy).toHaveBeenCalledWith(expect.any(String), 'directive:unknown', 1);
  });
});

describe('CspReportsService directive selection', () => {
  it('prefers violated-directive over effective-directive', async () => {
    const { service, redis } = createService();

    await service.record(
      wrapped({ 'violated-directive': 'script-src', 'effective-directive': 'img-src' }),
    );

    expect(callsOf(redis)[0].field).toBe('directive:script-src');
  });

  it('uses effective-directive when violated-directive is missing or empty', async () => {
    const { service, redis } = createService();

    await service.record(wrapped({ 'effective-directive': 'font-src' }));
    await service.record(wrapped({ 'violated-directive': '', 'effective-directive': 'frame-src' }));

    expect(callsOf(redis).map((c) => c.field)).toEqual([
      'directive:font-src',
      'total',
      'directive:frame-src',
      'total',
    ]);
  });
});

describe('CspReportsService expiry', () => {
  it('arms a 26 hour expiry once per payload', async () => {
    const { service, redis } = createService();

    await service.record([wrapped({ 'violated-directive': 'script-src' }), wrapped({})]);

    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledWith(expect.any(String), 26 * 60 * 60);
  });

  it('still arms the expiry for an empty array', async () => {
    const { service, redis } = createService();

    await service.record([]);

    expect(redis.hIncrBy).not.toHaveBeenCalled();
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });
});

describe('CspReportsService malformed payloads', () => {
  it.each([
    ['empty object', {}],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'garbage'],
    ['a number', 42],
    ['array of null items', [null, undefined]],
    ['null csp-report', wrapped(null)],
    ['empty array', []],
  ])('does not throw for %s', async (_label, payload) => {
    const { service } = createService();

    await expect(service.record(payload)).resolves.toBeUndefined();
  });

  it('books a non-object report as unknown rather than dropping it', async () => {
    const { service, redis } = createService();

    await service.record([null, 'garbage', 42]);

    expect(callsOf(redis).map((c) => c.field)).toEqual([
      'directive:unknown',
      'total',
      'directive:unknown',
      'total',
      'directive:unknown',
      'total',
    ]);
  });

  it('stringifies a non-string directive before cleaning', async () => {
    const { service, redis } = createService();

    await service.record(wrapped({ 'violated-directive': 12345 }));

    expect(callsOf(redis)[0].field).toBe('directive:12345');
  });

  it('ignores the raw report URL fields', async () => {
    const { service, redis } = createService();

    await service.record({
      'violated-directive': 'script-src',
      'document-uri': 'https://example.com/private?token=abc',
      'blocked-uri': 'https://evil.example/leak',
    });

    const serialized = JSON.stringify(callsOf(redis));
    expect(serialized).not.toContain('token=abc');
    expect(serialized).not.toContain('evil.example');
    expect(redis.hIncrBy).toHaveBeenCalledTimes(2);
  });

  it('rejects when Redis fails so the caller can swallow it', async () => {
    const { service, redis } = createService();
    redis.hIncrBy.mockRejectedValue(new Error('redis down'));

    await expect(service.record({ 'violated-directive': 'script-src' })).rejects.toThrow(
      'redis down',
    );
  });
});

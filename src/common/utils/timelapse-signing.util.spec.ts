import {
  signTimelapseJob, signTimelapseRequest, stableStringify, verifyTimelapseJob, verifyTimelapseRequest,
} from './timelapse-signing.util';

const SECRET = 'test-timelapse-worker-secret';

describe('timelapse internal signing', () => {
  it('accepts a matching signature before expiry and rejects after expiry', () => {
    const expiresAt = 1_700_000_100;
    const signature = signTimelapseRequest(SECRET, 'get', '/api/internal/timelapses/a/source', expiresAt);
    expect(verifyTimelapseRequest(SECRET, 'GET', '/api/internal/timelapses/a/source', expiresAt, signature, 1_700_000_000)).toBe(true);
    expect(verifyTimelapseRequest(SECRET, 'GET', '/api/internal/timelapses/a/source', expiresAt, signature, expiresAt + 1)).toBe(false);
    expect(verifyTimelapseRequest(SECRET, 'POST', '/api/internal/timelapses/a/source', expiresAt, signature, 1_700_000_000)).toBe(false);
    expect(verifyTimelapseRequest('other-secret', 'GET', '/api/internal/timelapses/a/source', expiresAt, signature, 1_700_000_000)).toBe(false);
  });

  it('rejects malformed signatures without throwing', () => {
    expect(verifyTimelapseRequest(SECRET, 'GET', '/x', 9999999999, 'not-a-signature')).toBe(false);
    expect(verifyTimelapseRequest('', 'GET', '/x', 9999999999, 'a'.repeat(64))).toBe(false);
    expect(verifyTimelapseJob(SECRET, { signature: 'short' })).toBe(false);
  });

  it('signs queue jobs independent of object key order', () => {
    const job = {
      version: 1, job_id: 'job-1', timelapse_id: 'tl-1', expires_at: '2030-01-01T00:00:00.000Z',
      source_url: 'https://forum.example/api/internal/source', nested: { b: 2, a: 1 },
    };
    const signature = signTimelapseJob(SECRET, job);
    const reordered = {
      nested: { a: 1, b: 2 }, source_url: job.source_url, expires_at: job.expires_at,
      timelapse_id: job.timelapse_id, job_id: job.job_id, version: 1,
    };
    expect(verifyTimelapseJob(SECRET, { ...reordered, signature })).toBe(true);
    expect(verifyTimelapseJob(SECRET, { ...reordered, source_url: 'https://evil.example', signature })).toBe(false);
  });

  it('stableStringify omits undefined values and sorts keys', () => {
    expect(stableStringify({ b: 1, a: undefined, c: [2, { z: 1, y: 2 }] })).toBe('{"b":1,"c":[2,{"y":2,"z":1}]}');
  });
});

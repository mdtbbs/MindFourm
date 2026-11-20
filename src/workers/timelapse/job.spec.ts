/** 队列消息签名与结构校验测试。 */

import { signTimelapseJob } from '../../common/utils/timelapse-signing.util';
import { TIMELAPSE_MAX_SOURCE_BYTES } from '../../modules/timelapses/timelapse.constants';
import { TimelapseJobError } from './job';
import { parseRenderJob } from './job';

const SECRET = 'test-worker-secret';
const JOB_ID = '123e4567-e89b-42d3-a456-426614174000';
const TIMELAPSE_ID = '223e4567-e89b-42d3-a456-426614174111';
const SHA = 'a'.repeat(64);

function baseJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    job_id: JOB_ID,
    timelapse_id: TIMELAPSE_ID,
    author_user_id: 7,
    source_sha256: SHA,
    source_size_bytes: 1024,
    source_url: `http://localhost:4000/api/internal/timelapses/${TIMELAPSE_ID}/source?expires=1&signature=x`,
    start_url: `http://localhost:4000/api/internal/timelapses/${TIMELAPSE_ID}/start?expires=1&signature=x`,
    video_upload_url: `http://localhost:4000/api/internal/timelapses/${TIMELAPSE_ID}/result/video?expires=1&signature=x`,
    poster_upload_url: `http://localhost:4000/api/internal/timelapses/${TIMELAPSE_ID}/result/poster?expires=1&signature=x`,
    result_url: `http://localhost:4000/api/internal/timelapses/${TIMELAPSE_ID}/result?expires=1&signature=x`,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function signedMessage(overrides: Record<string, unknown> = {}, secret = SECRET): string {
  const job = baseJob(overrides);
  return JSON.stringify({ ...job, signature: signTimelapseJob(secret, job) });
}

function expectJobCode(raw: string, code: string, nowMs?: number): void {
  try {
    parseRenderJob(SECRET, raw, nowMs);
  } catch (error) {
    expect(error).toBeInstanceOf(TimelapseJobError);
    expect((error as TimelapseJobError).code).toBe(code);
    return;
  }
  throw new Error(`期望任务校验失败（${code}）`);
}

describe('parseRenderJob', () => {
  it('接受合法签名消息并归一化 SHA-256', () => {
    const job = parseRenderJob(SECRET, signedMessage({ source_sha256: SHA.toUpperCase() }));
    expect(job).toMatchObject({
      version: 1,
      job_id: JOB_ID,
      timelapse_id: TIMELAPSE_ID,
      author_user_id: 7,
      source_sha256: SHA,
      source_size_bytes: 1024,
    });
    expect(job.signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it('拒绝签名被篡改/密钥不符/缺少签名', () => {
    const parsed = JSON.parse(signedMessage());
    parsed.source_size_bytes = 2048;
    expectJobCode(JSON.stringify(parsed), 'TIMELAPSE_JOB_SIGNATURE_INVALID');

    expectJobCode(signedMessage({}, 'other-secret'), 'TIMELAPSE_JOB_SIGNATURE_INVALID');

    const unsigned = baseJob();
    expectJobCode(JSON.stringify(unsigned), 'TIMELAPSE_JOB_SIGNATURE_INVALID');

    const emptySecret = JSON.parse(signedMessage());
    expect(() => parseRenderJob('', JSON.stringify(emptySecret))).toThrow(TimelapseJobError);
  });

  it('拒绝已过期任务', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const raw = signedMessage({ expires_at: past });
    expectJobCode(raw, 'TIMELAPSE_JOB_EXPIRED');
  });

  it('拒绝非法 JSON / 非对象消息', () => {
    expectJobCode('not json', 'TIMELAPSE_JOB_INVALID');
    expectJobCode('[]', 'TIMELAPSE_JOB_INVALID');
    expectJobCode('null', 'TIMELAPSE_JOB_INVALID');
  });

  it.each([
    ['version', { version: 2 }],
    ['job_id', { job_id: '../escape' }],
    ['timelapse_id', { timelapse_id: 'not-a-uuid' }],
    ['author_user_id', { author_user_id: 0 }],
    ['source_sha256', { source_sha256: 'abc' }],
    ['source_size_bytes', { source_size_bytes: 0 }],
    ['source_size_bytes 超限', { source_size_bytes: TIMELAPSE_MAX_SOURCE_BYTES + 1 }],
    ['source_url', { source_url: 'file:///etc/passwd' }],
    ['start_url', { start_url: 'ftp://example.org/start' }],
    ['result_url', { result_url: 'not a url' }],
    ['expires_at', { expires_at: 'yesterday' }],
  ])('拒绝非法字段 %s', (_label, overrides) => {
    expectJobCode(signedMessage(overrides), 'TIMELAPSE_JOB_INVALID');
  });

  it('接受等于上限的 source_size_bytes', () => {
    expect(parseRenderJob(SECRET, signedMessage({ source_size_bytes: TIMELAPSE_MAX_SOURCE_BYTES })).source_size_bytes)
      .toBe(TIMELAPSE_MAX_SOURCE_BYTES);
  });
});

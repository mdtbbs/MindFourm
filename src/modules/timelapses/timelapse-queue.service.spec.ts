import { TimelapseQueueService } from './timelapse-queue.service';
import { TIMELAPSE_JOB_QUEUE } from './timelapse.constants';
import { verifyTimelapseJob, verifyTimelapseRequest } from '../../common/utils/timelapse-signing.util';
import { AUTHOR_ID, REPORT_ID, SHA_A } from './timelapse-test.helpers';

/** 测试期间清空真实环境变量，避免 .env / CI 注入影响默认值断言。 */
const ORIGINAL_SECRET_ENV = process.env.TIMELAPSE_WORKER_SECRET;
const ORIGINAL_API_URL_ENV = process.env.API_URL;

beforeEach(() => {
  delete process.env.TIMELAPSE_WORKER_SECRET;
  delete process.env.API_URL;
});

afterAll(() => {
  if (ORIGINAL_SECRET_ENV === undefined) delete process.env.TIMELAPSE_WORKER_SECRET;
  else process.env.TIMELAPSE_WORKER_SECRET = ORIGINAL_SECRET_ENV;
  if (ORIGINAL_API_URL_ENV === undefined) delete process.env.API_URL;
  else process.env.API_URL = ORIGINAL_API_URL_ENV;
});

function makeService(configValues: Record<string, unknown> = {}, redisAvailable = true) {
  const lpush = jest.fn(async () => 1);
  const redis = {
    isRedisAvailable: jest.fn(() => redisAvailable),
    getClient: jest.fn(() => ({ lpush })),
  };
  const config = { get: jest.fn((key: string) => configValues[key]) };
  return { service: new TimelapseQueueService(redis as any, config as any), redis, config, lpush };
}

async function rejection(promise: Promise<unknown>): Promise<any> {
  const error: any = await promise.then(() => null, (reason) => reason);
  expect(error).toBeTruthy();
  return error;
}

const JOB_INPUT = {
  timelapseId: REPORT_ID,
  authorUserId: AUTHOR_ID,
  sourceSha256: SHA_A,
  sourceSizeBytes: 2048,
};

describe('TimelapseQueueService 配置与可用性', () => {
  it('未配置 worker secret 时返回 503 TIMELAPSE_WORKER_NOT_CONFIGURED', async () => {
    const { service, redis } = makeService();

    const error = await rejection(service.enqueue(JOB_INPUT));

    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({ code: 'TIMELAPSE_WORKER_NOT_CONFIGURED', retryable: true });
    expect(redis.getClient).not.toHaveBeenCalled();
    expect(service.isAvailable()).toBe(false);
  });

  it('Redis 不可用时返回 503 TIMELAPSE_QUEUE_UNAVAILABLE', async () => {
    const { service, redis } = makeService({ 'timelapse.workerSecret': 's3cret' }, false);

    const error = await rejection(service.enqueue(JOB_INPUT));

    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({ code: 'TIMELAPSE_QUEUE_UNAVAILABLE', retryable: true });
    expect(redis.getClient).not.toHaveBeenCalled();
  });

  it('secret 与 Redis 同时就绪时 isAvailable 为 true', () => {
    const { service } = makeService({ 'timelapse.workerSecret': 's3cret' }, true);
    expect(service.isAvailable()).toBe(true);
  });

  it('secret 可以来自 TIMELAPSE_WORKER_SECRET 环境变量', async () => {
    process.env.TIMELAPSE_WORKER_SECRET = 'env-secret';
    const { service, lpush } = makeService();

    await service.enqueue(JOB_INPUT);

    const job = JSON.parse(lpush.mock.calls[0][1]);
    expect(verifyTimelapseJob('env-secret', job)).toBe(true);
  });
});

describe('TimelapseQueueService 入队消息', () => {
  it('LPUSH 到 forum:timelapse:jobs，消息含 5 个可验证的签名 URL', async () => {
    const { service, lpush } = makeService({
      'timelapse.workerSecret': 's3cret',
      'timelapse.internalUrlTtlSeconds': 600,
      'app.apiUrl': 'https://forum.example.com/',
    });
    const startedSecond = Math.floor(Date.now() / 1000);

    const jobId = await service.enqueue(JOB_INPUT);

    expect(jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(lpush).toHaveBeenCalledTimes(1);
    const [queueName, message] = lpush.mock.calls[0];
    expect(queueName).toBe(TIMELAPSE_JOB_QUEUE);
    expect(TIMELAPSE_JOB_QUEUE).toBe('forum:timelapse:jobs');

    const job = JSON.parse(message);
    expect(job).toMatchObject({
      version: 1,
      job_id: jobId,
      timelapse_id: REPORT_ID,
      author_user_id: AUTHOR_ID,
      source_sha256: SHA_A,
      source_size_bytes: 2048,
      signature: expect.any(String),
      expires_at: expect.any(String),
    });
    // 队列消息签名必须能被 Worker 侧的 verifyTimelapseJob 原样验证。
    expect(verifyTimelapseJob('s3cret', job)).toBe(true);
    expect(verifyTimelapseJob('another-secret', job)).toBe(false);

    const expires = new Date(job.expires_at).getTime();
    expect(Math.floor(expires / 1000) - startedSecond).toBeGreaterThanOrEqual(595);
    expect(Math.floor(expires / 1000) - startedSecond).toBeLessThanOrEqual(610);

    const signedUrls: Array<[string, string, string]> = [
      ['source_url', 'GET', `/api/internal/timelapses/${REPORT_ID}/source`],
      ['start_url', 'POST', `/api/internal/timelapses/${REPORT_ID}/start`],
      ['video_upload_url', 'PUT', `/api/internal/timelapses/${REPORT_ID}/result/video`],
      ['poster_upload_url', 'PUT', `/api/internal/timelapses/${REPORT_ID}/result/poster`],
      ['result_url', 'POST', `/api/internal/timelapses/${REPORT_ID}/result`],
    ];
    expect(signedUrls).toHaveLength(5);

    for (const [field, method, path] of signedUrls) {
      const url = new URL(job[field]);
      const urlExpires = Number(url.searchParams.get('expires'));
      const signature = url.searchParams.get('signature') || '';
      expect(url.origin).toBe('https://forum.example.com');
      expect(url.pathname).toBe(path);
      expect(urlExpires).toBe(Math.floor(expires / 1000));
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
      // 签名绑定方法 + 完整路径 + 过期时间：换方法或换路径都必须失败。
      expect(verifyTimelapseRequest('s3cret', method, path, urlExpires, signature)).toBe(true);
      expect(verifyTimelapseRequest('s3cret', 'DELETE', path, urlExpires, signature)).toBe(false);
      expect(verifyTimelapseRequest('s3cret', method, path, urlExpires + 1, signature)).toBe(false);
    }
  });

  it('未配置 TTL 与 API_URL 时使用 1 小时与 localhost 默认值', async () => {
    const { service, lpush } = makeService({ 'timelapse.workerSecret': 's3cret' });

    await service.enqueue(JOB_INPUT);

    const job = JSON.parse(lpush.mock.calls[0][1]);
    expect(job.source_url.startsWith(`http://localhost:4000/api/internal/timelapses/${REPORT_ID}/source?`)).toBe(true);
    const ttlSeconds = (Date.parse(job.expires_at) - Date.now()) / 1000;
    expect(ttlSeconds).toBeGreaterThan(3590);
    expect(ttlSeconds).toBeLessThanOrEqual(3605);
  });

  it('API_URL 环境变量作为内部地址回退', async () => {
    process.env.API_URL = 'https://env.example.com';
    const { service, lpush } = makeService({ 'timelapse.workerSecret': 's3cret' });

    await service.enqueue(JOB_INPUT);

    const job = JSON.parse(lpush.mock.calls[0][1]);
    expect(job.start_url.startsWith('https://env.example.com/api/internal/timelapses/')).toBe(true);
  });

  it('LPUSH 抛错时转换为 503 TIMELAPSE_QUEUE_UNAVAILABLE', async () => {
    const { service, lpush } = makeService({ 'timelapse.workerSecret': 's3cret' });
    lpush.mockRejectedValue(new Error('redis down'));

    const error = await rejection(service.enqueue(JOB_INPUT));

    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({ code: 'TIMELAPSE_QUEUE_UNAVAILABLE', retryable: true });
  });

  it('每次入队生成不同的 job_id', async () => {
    const { service, lpush } = makeService({ 'timelapse.workerSecret': 's3cret' });

    const first = await service.enqueue(JOB_INPUT);
    const second = await service.enqueue(JOB_INPUT);

    expect(first).not.toBe(second);
    expect(JSON.parse(lpush.mock.calls[0][1]).job_id).toBe(first);
    expect(JSON.parse(lpush.mock.calls[1][1]).job_id).toBe(second);
  });
});

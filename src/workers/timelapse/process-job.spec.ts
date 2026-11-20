/**
 * 渲染流水线测试：用内存 ZIP、假 fetch 与假 ffmpeg 验证
 * 下载 → start → 合成 → 上传 → 回写 → 清理的完整闭环及失败回写。
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TIMELAPSE_WORKER_VERSION,
  type TimelapseRenderJob,
} from '../../modules/timelapses/timelapse.constants';
import { processRenderJob, type RenderJobDependencies } from './process-job';
import {
  buildZip,
  manifestBuffer,
  metricLine,
  metricsJsonl,
  pngHeader,
} from './test-fixtures';
import type { runFfmpeg } from './ffmpeg';

const JOB_ID = '123e4567-e89b-42d3-a456-426614174000';
const TIMELAPSE_ID = '223e4567-e89b-42d3-a456-426614174111';
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function archiveZip(): Buffer {
  const frames = Array.from({ length: 5 }, (_, index) => ({
    name: `frames/${String(index).padStart(4, '0')}.png`,
    data: pngHeader({ width: 64, height: 64 }),
  }));
  const digest = createHash('sha256');
  for (const frame of frames) digest.update(frame.data);
  return buildZip([
    {
      name: 'manifest.json',
      method: 8,
      data: manifestBuffer({ frame_count: 5, map_name: 'Serpulo', frames_digest_sha256: digest.digest('hex') }),
    },
    {
      name: 'metrics.jsonl',
      method: 8,
      data: metricsJsonl(Array.from({ length: 5 }, (_, index) => metricLine({ idx: index, elapsed_sec: index, wave: index + 1 }))),
    },
    ...frames,
  ]);
}

function makeJob(zip: Buffer): TimelapseRenderJob {
  const base = `http://control.test/api/internal/timelapses/${TIMELAPSE_ID}`;
  return {
    version: 1,
    job_id: JOB_ID,
    timelapse_id: TIMELAPSE_ID,
    author_user_id: 7,
    source_sha256: createHash('sha256').update(zip).digest('hex'),
    source_size_bytes: zip.length,
    source_url: `${base}/source`,
    start_url: `${base}/start`,
    video_upload_url: `${base}/result/video`,
    poster_upload_url: `${base}/result/poster`,
    result_url: `${base}/result`,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    signature: 'a'.repeat(64),
  };
}

const fakeFfmpeg: typeof runFfmpeg = async (_executable, args) => {
  const outputPath = args[args.length - 1];
  if (outputPath.endsWith('.mp4')) {
    await fs.writeFile(outputPath, Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]));
  } else {
    await fs.writeFile(outputPath, Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]));
  }
};

interface CallRecord { url: string; method: string; contentType?: string }

function makeFetch(options: {
  zip: Buffer;
  resultStatus?: number;
  sourceStatus?: number;
}): { fetchImpl: (url: string, init?: any) => Promise<Response>; calls: CallRecord[]; resultPayloads: any[] } {
  const calls: CallRecord[] = [];
  const resultPayloads: any[] = [];
  const fetchImpl = async (url: string, init: any = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ url, method, contentType: init.headers?.['Content-Type'] });
    if (url.endsWith('/source')) {
      if (options.sourceStatus && options.sourceStatus !== 200) {
        return new Response('missing', { status: options.sourceStatus });
      }
      return new Response(new Uint8Array(options.zip), {
        status: 200,
        headers: { 'content-length': String(options.zip.length), 'content-type': 'application/zip' },
      });
    }
    if (url.endsWith('/start')) return new Response('{}', { status: 200 });
    if (url.endsWith('/result/video') || url.endsWith('/result/poster')) {
      // 消费请求体，确保文件流被关闭。
      await new Response(init.body).arrayBuffer().catch(() => undefined);
      return new Response('{}', { status: 200 });
    }
    if (url.endsWith('/result')) {
      resultPayloads.push(JSON.parse(String(init.body)));
      return new Response('{}', { status: options.resultStatus ?? 200 });
    }
    return new Response('not found', { status: 404 });
  };
  return { fetchImpl, calls, resultPayloads };
}

describe('processRenderJob', () => {
  it('完成完整流水线并回写 completed', async () => {
    const root = await tempDir('mdtl-job-');
    const zip = archiveZip();
    const job = makeJob(zip);
    const { fetchImpl, calls, resultPayloads } = makeFetch({ zip });
    const deps: RenderJobDependencies = {
      fetchImpl,
      ffmpegPath: 'fake-ffmpeg',
      hudFont: null,
      workRoot: root,
      ffmpegTimeoutMs: 1000,
      httpRetries: 0,
      sleep: async () => undefined,
      runFfmpeg: fakeFfmpeg,
    };

    const outcome = await processRenderJob(job, deps);

    expect(outcome).toEqual({ acked: true, status: 'completed' });
    expect(calls.map((call) => call.method)).toEqual(['GET', 'POST', 'PUT', 'PUT', 'POST']);
    expect(calls[0].url).toContain('/source');
    expect(calls[1].url).toContain('/start');
    expect(calls[2].url).toContain('/result/video');
    expect(calls[2].contentType).toBe('video/mp4');
    expect(calls[3].url).toContain('/result/poster');
    expect(calls[3].contentType).toBe('image/webp');
    expect(calls[4].url).toContain('/result');

    expect(resultPayloads).toHaveLength(1);
    expect(resultPayloads[0]).toMatchObject({
      job_id: JOB_ID,
      status: 'completed',
      map_name: 'Serpulo',
      frame_count: 5,
      max_wave: 5,
      duration_seconds: 4,
      worker_version: TIMELAPSE_WORKER_VERSION,
    });
    expect(resultPayloads[0].summary_metrics).toHaveLength(5);
    expect(resultPayloads[0].highlights.max_wave).toBe(5);

    // 任务目录在 finally 中递归删除。
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('源包校验失败时回写 failed 并清理临时目录', async () => {
    const root = await tempDir('mdtl-job-');
    const zip = archiveZip();
    const job = makeJob(zip);
    const { fetchImpl, calls, resultPayloads } = makeFetch({ zip, sourceStatus: 500 });

    const outcome = await processRenderJob(job, {
      fetchImpl,
      workRoot: root,
      httpRetries: 0,
      sleep: async () => undefined,
      hudFont: null,
      runFfmpeg: fakeFfmpeg,
    });

    expect(outcome.acked).toBe(true);
    expect(outcome.status).toBe('failed');
    expect(outcome.failureCode).toBe('WORKER_SOURCE_INVALID');
    expect(calls.map((call) => call.method)).toEqual(['GET', 'POST']);
    expect(resultPayloads[0]).toMatchObject({
      job_id: JOB_ID,
      status: 'failed',
      failure_code: 'WORKER_SOURCE_INVALID',
      worker_version: TIMELAPSE_WORKER_VERSION,
    });
    expect(resultPayloads[0].failure_reason.length).toBeLessThanOrEqual(255);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('ffmpeg 失败时回写 failed', async () => {
    const root = await tempDir('mdtl-job-');
    const zip = archiveZip();
    const job = makeJob(zip);
    const { fetchImpl, resultPayloads } = makeFetch({ zip });
    const failingFfmpeg: typeof runFfmpeg = async () => {
      const { TimelapseWorkerError } = await import('./errors');
      throw new TimelapseWorkerError('TIMELAPSE_FFMPEG_TIMEOUT', 'ffmpeg 渲染超时（测试）。');
    };

    const outcome = await processRenderJob(job, {
      fetchImpl,
      workRoot: root,
      httpRetries: 0,
      sleep: async () => undefined,
      hudFont: null,
      runFfmpeg: failingFfmpeg,
    });

    expect(outcome.acked).toBe(true);
    expect(outcome.failureCode).toBe('TIMELAPSE_FFMPEG_TIMEOUT');
    expect(resultPayloads[0]).toMatchObject({ status: 'failed', failure_code: 'TIMELAPSE_FFMPEG_TIMEOUT' });
    expect(await fs.readdir(root)).toEqual([]);
  });

  it('失败结果也无法回写时不 ACK（保留 processing 消息）', async () => {
    const root = await tempDir('mdtl-job-');
    const zip = archiveZip();
    const job = makeJob(zip);
    const { fetchImpl, resultPayloads } = makeFetch({ zip, sourceStatus: 500, resultStatus: 500 });

    const outcome = await processRenderJob(job, {
      fetchImpl,
      workRoot: root,
      httpRetries: 0,
      sleep: async () => undefined,
      hudFont: null,
      runFfmpeg: fakeFfmpeg,
    });

    expect(outcome.acked).toBe(false);
    expect(outcome.status).toBe('failed');
    expect(resultPayloads).toHaveLength(1);
    expect(await fs.readdir(root)).toEqual([]);
  });
});

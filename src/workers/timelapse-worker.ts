/**
 * 基地延时摄影渲染 Worker（独立进程）。
 *
 * 运行方式：
 *   npm run build:backend && npm run start:timelapse-worker
 *   npm run dev:timelapse-worker            # nest --watch
 *
 * 进程只连接 Redis 队列，不连接数据库；输入与回写全部走控制面随任务下发的
 * HMAC 签名 URL。串行处理（并发 1），收到 SIGINT/SIGTERM 后完成当前任务再退出。
 */

import { config as loadEnv } from 'dotenv';
import Redis from 'ioredis';
import {
  TIMELAPSE_JOB_QUEUE,
  TIMELAPSE_PROCESSING_QUEUE,
} from '../modules/timelapses/timelapse.constants';
import { TimelapseWorkerError } from './timelapse/errors';
import { parseRenderJob } from './timelapse/job';
import { processRenderJob } from './timelapse/process-job';
import { loadWorkerConfig, workerLog, type TimelapseWorkerConfig } from './timelapse/worker-config';

// 允许通过 TIMELAPSE_WORKER_ENV_FILE 指定专用 env 文件；否则尝试项目根目录 .env。
// dotenv 不会覆盖已存在的环境变量，也不会打印内容。
const envFile = process.env.TIMELAPSE_WORKER_ENV_FILE?.trim();
loadEnv(envFile ? { path: envFile } : undefined);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function acknowledge(redis: Redis, raw: string): Promise<void> {
  try {
    await redis.lrem(TIMELAPSE_PROCESSING_QUEUE, 1, raw);
  } catch (error: any) {
    workerLog('error', `从 processing 队列删除消息失败：${error?.message || '未知错误'}`);
  }
}

async function handleMessage(redis: Redis, config: TimelapseWorkerConfig, raw: string): Promise<void> {
  let job;
  try {
    job = parseRenderJob(config.secret, raw);
  } catch (error: any) {
    const code = error instanceof TimelapseWorkerError ? error.code : 'TIMELAPSE_JOB_INVALID';
    // 签名失败/结构非法/已过期的消息不能执行，也不值得留在 processing 队列。
    workerLog('error', `丢弃无效任务（${code}）：${error?.message || '消息不可解析'}`);
    await acknowledge(redis, raw);
    return;
  }

  let outcome;
  try {
    outcome = await processRenderJob(job, {
      ffmpegPath: config.ffmpegPath,
      hudFont: config.hudFont,
      workRoot: config.workRoot,
    });
  } catch (error: any) {
    // processRenderJob 正常情况下不会抛异常；兜底避免整个 Worker 退出。
    workerLog('error', `job=${job.job_id} timelapse=${job.timelapse_id} 处理异常：${error?.message || '未知错误'}`);
    return;
  }
  if (outcome.acked) {
    await acknowledge(redis, raw);
  } else {
    workerLog('warn', `job=${job.job_id} 未 ACK，消息保留在 processing 队列等待人工重放。`);
  }
}

async function main(): Promise<void> {
  const config = loadWorkerConfig();
  if (!config.secret.trim()) {
    workerLog('error', 'TIMELAPSE_WORKER_SECRET 未配置，拒绝启动渲染 Worker。');
    process.exit(1);
  }

  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    // 阻塞命令需要无限重试；断线期间命令排队，恢复后继续消费。
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  redis.on('ready', () => workerLog('info', 'Redis 已连接。'));
  redis.on('error', (error: Error) => workerLog('error', `Redis 连接错误：${error.message}`));

  let stopping = false;
  let processing = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    workerLog('info', `收到 ${signal}，${processing ? '等待当前任务完成后退出' : '立即退出'}。`);
    if (!processing) {
      // 打断正在阻塞的 BRPOPLPUSH；已取出的消息不受影响。
      try {
        redis.disconnect();
      } catch {
        // 已断开。
      }
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  workerLog(
    'info',
    `渲染 Worker 启动：queue=${TIMELAPSE_JOB_QUEUE} processing=${TIMELAPSE_PROCESSING_QUEUE} `
    + `poll=${config.pollTimeoutSeconds}s ffmpeg=${config.ffmpegPath} work=${config.workRoot}`,
  );

  while (!stopping) {
    let raw: string | null;
    try {
      raw = await redis.brpoplpush(
        TIMELAPSE_JOB_QUEUE,
        TIMELAPSE_PROCESSING_QUEUE,
        config.pollTimeoutSeconds,
      );
    } catch (error: any) {
      if (stopping) break;
      workerLog('error', `读取队列失败：${error?.message || '未知错误'}，2 秒后重试。`);
      await sleep(2000);
      continue;
    }
    if (raw === null) continue;

    processing = true;
    try {
      await handleMessage(redis, config, raw);
    } finally {
      processing = false;
    }
  }

  try {
    await redis.quit();
  } catch {
    try {
      redis.disconnect();
    } catch {
      // 已断开。
    }
  }
  workerLog('info', '渲染 Worker 已退出。');
}

main().catch((error: any) => {
  workerLog('error', `渲染 Worker 异常退出：${error?.message || '未知错误'}`);
  process.exitCode = 1;
});

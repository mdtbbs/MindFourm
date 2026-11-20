/**
 * Worker 配置与日志。
 *
 * 配置只来自环境变量；日志统一带时间戳与 `[timelapse-worker]` 前缀，
 * 调用方负责带上 job_id / timelapse_id，任何地方都不得输出 secret 或完整 URL。
 */

import os from 'node:os';
import path from 'node:path';

export interface TimelapseWorkerConfig {
  secret: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  ffmpegPath: string;
  /** null 表示显式禁用 HUD 字体；undefined 表示自动探测。 */
  hudFont: string | null | undefined;
  workRoot: string;
  pollTimeoutSeconds: number;
}

function positiveInteger(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, parsed);
}

function nonNegativeInteger(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(max, parsed);
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): TimelapseWorkerConfig {
  const hudFont = env.TIMELAPSE_HUD_FONT === undefined
    ? undefined
    : env.TIMELAPSE_HUD_FONT.trim() || null;
  return {
    secret: env.TIMELAPSE_WORKER_SECRET ?? '',
    redis: {
      host: env.REDIS_HOST?.trim() || 'localhost',
      port: positiveInteger(env.REDIS_PORT, 6379, 65535),
      password: env.REDIS_PASSWORD ? env.REDIS_PASSWORD : undefined,
      db: nonNegativeInteger(env.REDIS_DB, 0, 255),
    },
    ffmpegPath: env.FFMPEG_PATH?.trim() || 'ffmpeg',
    hudFont,
    workRoot: path.resolve(env.TIMELAPSE_WORK_DIR?.trim() || path.join(os.tmpdir(), 'mdtbbs-timelapse')),
    pollTimeoutSeconds: Math.min(60, positiveInteger(env.WORKER_POLL_TIMEOUT_SECONDS, 5, 60)),
  };
}

export type WorkerLogLevel = 'info' | 'warn' | 'error';

/** 结构化但不含敏感信息的单行日志。 */
export function workerLog(level: WorkerLogLevel, message: string): void {
  const line = `[${new Date().toISOString()}] [timelapse-worker] [${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(line);
  else console.log(line);
}

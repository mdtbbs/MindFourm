/**
 * 渲染队列消息的解析与签名校验。
 *
 * 队列消息由控制面用 `TIMELAPSE_WORKER_SECRET` 对稳定 JSON 签名；Worker
 * 在信任任何字段（尤其是 URL）之前必须先通过 HMAC 校验。字段结构再做
 * 一层白名单校验，避免控制面 bug 或脏消息把 Worker 引到意外路径。
 */

import { verifyTimelapseJob } from '../../common/utils/timelapse-signing.util';
import {
  TIMELAPSE_MAX_SOURCE_BYTES,
  isSafePublicId,
  type TimelapseRenderJob,
} from '../../modules/timelapses/timelapse.constants';
import { TimelapseWorkerError } from './errors';

const SHA256_RE = /^[a-f0-9]{64}$/i;
const URL_MAX_LENGTH = 4096;

/** 队列消息本身无效（结构或签名）；消息应被丢弃并记录，不执行。 */
export class TimelapseJobError extends TimelapseWorkerError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'TimelapseJobError';
  }
}

function jobInvalid(message: string): never {
  throw new TimelapseJobError('TIMELAPSE_JOB_INVALID', message);
}

function requireUrl(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value || value.length > URL_MAX_LENGTH) {
    jobInvalid(`任务字段 ${field} 不是合法 URL。`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    jobInvalid(`任务字段 ${field} 不是合法 URL。`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    jobInvalid(`任务字段 ${field} 只允许 http/https。`);
  }
  return value;
}

/**
 * 解析并校验一条队列消息。
 *
 * @param secret 控制面共享 secret
 * @param raw Redis 中的原始消息
 * @param nowMs 当前时间（测试可注入）
 */
export function parseRenderJob(secret: string, raw: string, nowMs: number = Date.now()): TimelapseRenderJob {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TimelapseJobError('TIMELAPSE_JOB_INVALID', '任务消息不是合法 JSON。');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TimelapseJobError('TIMELAPSE_JOB_INVALID', '任务消息必须是 JSON 对象。');
  }
  const record = parsed as Record<string, unknown>;
  if (!secret || !verifyTimelapseJob(secret, record)) {
    throw new TimelapseJobError('TIMELAPSE_JOB_SIGNATURE_INVALID', '任务消息签名校验失败。');
  }

  if (record.version !== 1) jobInvalid('任务协议版本必须为 1。');
  if (typeof record.job_id !== 'string' || !isSafePublicId(record.job_id)) jobInvalid('任务 job_id 不是合法 UUID。');
  if (typeof record.timelapse_id !== 'string' || !isSafePublicId(record.timelapse_id)) {
    jobInvalid('任务 timelapse_id 不是合法 UUID。');
  }
  if (typeof record.author_user_id !== 'number' || !Number.isSafeInteger(record.author_user_id) || record.author_user_id <= 0) {
    jobInvalid('任务 author_user_id 必须是正整数。');
  }
  if (typeof record.source_sha256 !== 'string' || !SHA256_RE.test(record.source_sha256)) {
    jobInvalid('任务 source_sha256 必须是 64 位十六进制字符串。');
  }
  if (typeof record.source_size_bytes !== 'number'
    || !Number.isSafeInteger(record.source_size_bytes)
    || record.source_size_bytes <= 0
    || record.source_size_bytes > TIMELAPSE_MAX_SOURCE_BYTES) {
    jobInvalid(`任务 source_size_bytes 必须在 1..${TIMELAPSE_MAX_SOURCE_BYTES} 之间。`);
  }
  const sourceUrl = requireUrl(record.source_url, 'source_url');
  const startUrl = requireUrl(record.start_url, 'start_url');
  const videoUploadUrl = requireUrl(record.video_upload_url, 'video_upload_url');
  const posterUploadUrl = requireUrl(record.poster_upload_url, 'poster_upload_url');
  const resultUrl = requireUrl(record.result_url, 'result_url');

  if (typeof record.expires_at !== 'string') jobInvalid('任务 expires_at 缺失。');
  const expiresAtMs = Date.parse(record.expires_at);
  if (!Number.isFinite(expiresAtMs)) jobInvalid('任务 expires_at 不是合法时间。');
  if (expiresAtMs <= nowMs) {
    throw new TimelapseJobError('TIMELAPSE_JOB_EXPIRED', '任务签名 URL 已过期。');
  }

  return {
    version: 1,
    job_id: record.job_id,
    timelapse_id: record.timelapse_id,
    author_user_id: record.author_user_id,
    source_sha256: record.source_sha256.toLowerCase(),
    source_size_bytes: record.source_size_bytes,
    source_url: sourceUrl,
    start_url: startUrl,
    video_upload_url: videoUploadUrl,
    poster_upload_url: posterUploadUrl,
    result_url: resultUrl,
    expires_at: record.expires_at,
    signature: String(record.signature),
  };
}

/**
 * Worker ↔ 控制面的 HTTP 通道。
 *
 * Worker 不持有会话或数据库凭证，源包与回写都只走控制面下发的签名 URL。
 * 回写类请求（start / 视频 / 封面 / 结果）按指数退避重试 3 次；源包下载
 * 只做一次流式读取，并在读取过程中计算 SHA-256 与大小。
 */

import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import {
  TIMELAPSE_MAX_SOURCE_BYTES,
} from '../../modules/timelapses/timelapse.constants';
import { TimelapseWorkerError } from './errors';

export type FetchLike = (input: string, init?: any) => Promise<Response>;

export interface HttpRetryOptions {
  fetchImpl?: FetchLike;
  /** 初次请求之外的重试次数，默认 3。 */
  retries?: number;
  /** 指数退避基数（毫秒），默认 250。 */
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** 单次请求超时（毫秒），默认 120s。 */
  timeoutMs?: number;
  onRetry?: (attempt: number, reason: string) => void;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_TIMEOUT_MS = 120_000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * 带指数退避的请求。仅对网络错误、408/425/429/5xx 重试；
 * 其余 4xx 视为签名/状态错误，立即失败。
 */
async function requestWithRetry(
  url: string,
  init: any,
  label: string,
  code: string,
  options: HttpRetryOptions,
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastReason = '网络错误';

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      lastReason = '网络错误';
      if (attempt < retries) {
        options.onRetry?.(attempt + 1, lastReason);
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      throw new TimelapseWorkerError(code, `请求${label}失败（网络错误）。`);
    }

    if (response.ok) return response;

    const status = response.status;
    lastReason = `HTTP ${status}`;
    // 释放响应体，避免 keep-alive 连接被占用。
    await response.body?.cancel().catch(() => undefined);
    if (isRetryableStatus(status) && attempt < retries) {
      options.onRetry?.(attempt + 1, lastReason);
      await sleep(baseDelayMs * 2 ** attempt);
      continue;
    }
    throw new TimelapseWorkerError(code, `请求${label}失败（HTTP ${status}）。`);
  }
  throw new TimelapseWorkerError(code, `请求${label}失败（${lastReason}）。`);
}

/** 标记 processing。 */
export async function postStart(url: string, options: HttpRetryOptions = {}): Promise<void> {
  const response = await requestWithRetry(url, { method: 'POST' }, '开始回调', 'TIMELAPSE_WORKER_START_FAILED', options);
  await response.arrayBuffer().catch(() => undefined);
}

/** 上传产物（视频/封面），每次重试都重新打开文件流。 */
export async function uploadArtifact(
  url: string,
  filePath: string,
  contentType: string,
  maxBytes: number,
  options: HttpRetryOptions = {},
): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw new TimelapseWorkerError('TIMELAPSE_ARTIFACT_MISSING', '渲染产物不存在。');
  }
  if (!stat.isFile() || stat.size <= 0) {
    throw new TimelapseWorkerError('TIMELAPSE_ARTIFACT_MISSING', '渲染产物为空。');
  }
  if (stat.size > maxBytes) {
    throw new TimelapseWorkerError('TIMELAPSE_ARTIFACT_TOO_LARGE', '渲染产物超过大小上限。');
  }

  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastReason = '网络错误';

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const fileStream = createReadStream(filePath);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'Content-Length': String(stat.size) },
        body: Readable.toWeb(fileStream) as any,
        duplex: 'half',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      fileStream.destroy();
      lastReason = '网络错误';
      if (attempt < retries) {
        options.onRetry?.(attempt + 1, lastReason);
        await sleep(baseDelayMs * 2 ** attempt);
        continue;
      }
      throw new TimelapseWorkerError('TIMELAPSE_WORKER_UPLOAD_FAILED', '上传渲染产物失败（网络错误）。');
    }

    if (response.ok) {
      await response.arrayBuffer().catch(() => undefined);
      return;
    }
    const status = response.status;
    lastReason = `HTTP ${status}`;
    await response.body?.cancel().catch(() => undefined);
    if (isRetryableStatus(status) && attempt < retries) {
      options.onRetry?.(attempt + 1, lastReason);
      await sleep(baseDelayMs * 2 ** attempt);
      continue;
    }
    throw new TimelapseWorkerError('TIMELAPSE_WORKER_UPLOAD_FAILED', `上传渲染产物失败（HTTP ${status}）。`);
  }
  throw new TimelapseWorkerError('TIMELAPSE_WORKER_UPLOAD_FAILED', `上传渲染产物失败（${lastReason}）。`);
}

/** 回写渲染结果（completed / failed）。 */
export async function postResult(url: string, payload: unknown, options: HttpRetryOptions = {}): Promise<void> {
  const response = await requestWithRetry(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    '结果回写',
    'TIMELAPSE_WORKER_RESULT_FAILED',
    options,
  );
  await response.arrayBuffer().catch(() => undefined);
}

export interface DownloadSourceExpectation {
  sha256: string;
  size: number;
}

export interface DownloadSourceOptions extends HttpRetryOptions {
  maxBytes?: number;
}

/**
 * 流式下载源包到 destPath，读取过程中计算 SHA-256 与字节数。
 *
 * 失败统一抛 `WORKER_SOURCE_INVALID`（包括 HTTP 错误、超限、校验不符）。
 */
export async function downloadSource(
  url: string,
  destPath: string,
  expected: DownloadSourceExpectation,
  options: DownloadSourceOptions = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  const maxBytes = options.maxBytes ?? TIMELAPSE_MAX_SOURCE_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let handle: fs.FileHandle | null = null;

  const fail = (message: string): never => {
    throw new TimelapseWorkerError('WORKER_SOURCE_INVALID', message);
  };

  try {
    let response!: Response;
    try {
      response = await fetchImpl(url, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      fail('源包下载失败（网络错误）。');
    }
    if (!response.ok) fail(`源包下载失败（HTTP ${response.status}）。`);
    if (!response.body) fail('源包响应为空。');
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > 0) {
      if (contentLength > maxBytes || contentLength > expected.size) {
        fail('源包大小与任务声明不一致。');
      }
    }

    handle = await fs.open(destPath, 'wx', 0o600);
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of Readable.fromWeb(response.body as any)) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > maxBytes) fail(`源包超过 ${maxBytes} 字节上限。`);
      if (size > expected.size) fail('源包大小与任务声明不一致。');
      hash.update(bytes);
      await handle.write(bytes);
    }
    if (size !== expected.size) fail('源包大小与任务声明不一致。');
    const actual = hash.digest('hex');
    if (actual !== expected.sha256.toLowerCase()) fail('源包 SHA-256 与任务声明不一致。');
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    handle = null;
    await fs.rm(destPath, { force: true }).catch(() => undefined);
    if (error instanceof TimelapseWorkerError) throw error;
    throw new TimelapseWorkerError('WORKER_SOURCE_INVALID', '源包下载或校验失败。');
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
}

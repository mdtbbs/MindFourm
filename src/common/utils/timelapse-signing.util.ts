import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 控制面 ↔ 渲染 Worker 的内部签名协议。
 *
 * Worker 不持有数据库或会话凭证，所有输入/回写都走这些签名 URL：
 *   - 请求签名：`HMAC-SHA256(secret, METHOD + "\n" + PATH + "\n" + EXPIRES)`
 *   - 队列消息签名：`HMAC-SHA256(secret, stableStringify(jobWithoutSignature))`
 *
 * 签名比较使用 `timingSafeEqual`，过期时间由调用方传入当前时间以便测试。
 */

const SIGNATURE_RE = /^[a-f0-9]{64}$/;

export function timelapseRequestSigningPayload(method: string, path: string, expiresAt: number): string {
  return `${method.toUpperCase()}\n${path}\n${expiresAt}`;
}

export function signTimelapseRequest(secret: string, method: string, path: string, expiresAt: number): string {
  return createHmac('sha256', secret).update(timelapseRequestSigningPayload(method, path, expiresAt)).digest('hex');
}

export function verifyTimelapseRequest(
  secret: string,
  method: string,
  path: string,
  expiresAt: number,
  signature: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !SIGNATURE_RE.test(signature) || !Number.isSafeInteger(expiresAt)) return false;
  if (expiresAt < nowSeconds) return false;
  const expected = signTimelapseRequest(secret, method, path, expiresAt);
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(signature, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** 键排序后的稳定 JSON，保证签名两端字节一致。 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((item) => stableStringify(item)).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => JSON.stringify(key) + ':' + stableStringify(record[key]))
    .join(',') + '}';
}

export function signTimelapseJob(secret: string, jobWithoutSignature: Record<string, unknown>): string {
  return createHmac('sha256', secret).update(stableStringify(jobWithoutSignature)).digest('hex');
}

export function verifyTimelapseJob(
  secret: string,
  job: Record<string, unknown> & { signature?: unknown },
): boolean {
  const signature = typeof job.signature === 'string' ? job.signature : '';
  if (!secret || !SIGNATURE_RE.test(signature)) return false;
  const { signature: _ignored, ...rest } = job;
  const expected = signTimelapseJob(secret, rest);
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(signature, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

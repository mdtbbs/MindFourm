/**
 * Small JSON request helper for feature modules that cannot use `client.ts`'s own
 * `request`.
 *
 * `request` is module-private there and exporting it would mean editing a file under
 * concurrent change, so the behaviour that actually matters is reproduced here:
 * cookie credentials, the CSRF double-submit header on writes, and unwrapping the
 * global `{ success, data }` envelope. Deliberately *not* reproduced is the 30-second
 * GET response cache — reaction counts and block lists must reflect a write that just
 * happened, and a cached read would show the pre-toggle number.
 */

import { buildPublicApiUrl } from '@/lib/api/client';
import { tryNormalizePaginatedApiPayload, unwrapApiPayload } from '@/lib/api/response';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Carries the status so callers can map individual failures to specific copy. */
export class JsonRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'JsonRequestError';
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;

  const pair = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('csrf_token='));

  return pair ? decodeURIComponent(pair.slice('csrf_token='.length)) : undefined;
}

/**
 * Mint a CSRF cookie if the browser does not have one yet.
 *
 * Any session read sets it as a side effect. Failures are swallowed because the write
 * that follows reports the real problem — surfacing an error from this priming call
 * would blame the wrong request.
 */
async function ensureCsrfToken(): Promise<void> {
  if (typeof document === 'undefined' || readCsrfToken()) return;

  await fetch(buildPublicApiUrl('/api/auth/check'), {
    method: 'GET',
    credentials: 'include',
  }).catch(() => undefined);
}

/** NestJS validation errors arrive as `message: string[]`. */
function readErrorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback;
  if (typeof body.message === 'string') return body.message;
  if (Array.isArray(body.message)) {
    const parts = body.message.filter((part): part is string => typeof part === 'string');
    if (parts.length > 0) return parts.join('；');
  }
  return fallback;
}

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = String(options.method ?? 'GET').toUpperCase();
  const isWrite = WRITE_METHODS.has(method);

  if (isWrite) await ensureCsrfToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-API-Version': '1',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (isWrite) {
    const csrfToken = readCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  let res: Response;
  try {
    res = await fetch(buildPublicApiUrl(path), {
      ...options,
      method,
      headers,
      credentials: 'include',
    });
  } catch (err) {
    // Status 0 marks "never reached the server", which callers must not map to any
    // API-specific message.
    throw new JsonRequestError(err instanceof Error ? err.message : '网络请求失败', 0);
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // Error bodies are not always JSON (a proxy's HTML page, for one); the status
      // still carries the meaning.
    }
    const code = isRecord(body) && typeof body.code === 'string' ? body.code : undefined;
    throw new JsonRequestError(readErrorMessage(body, `请求失败：${res.status}`), res.status, code);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new JsonRequestError('响应格式错误', res.status);
  }

  const paginated = tryNormalizePaginatedApiPayload<unknown, Record<string, unknown>>(payload);
  if (paginated) {
    return paginated as T;
  }

  return unwrapApiPayload<T>(payload) ?? (payload as T);
}

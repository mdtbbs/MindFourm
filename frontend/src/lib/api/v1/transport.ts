/**
 * V1 API transport layer.
 *
 * Handles the V1 response envelope: `{ data, meta: { request_id } }`.
 * Unwraps the data payload for callers, throwing a typed `V1ApiError`
 * on non-2xx responses.
 *
 * V1 endpoints live under `/api/v1/*` and intentionally use a different
 * envelope from the legacy `{ success, data }` shape the rest of the
 * frontend consumes. This transport is the single place that knows
 * about the difference.
 */

import { buildPublicApiUrl } from '../client';

/**
 * Browser calls intentionally stay on the public API base so Next rewrites and
 * cross-origin deployments continue to work. Server Components run in Node,
 * where fetch rejects relative URLs, so they must call the backend directly.
 */
function buildV1ApiUrl(path: string): string {
  if (typeof window !== 'undefined') {
    return buildPublicApiUrl(`/api/v1${path}`);
  }
  const apiBase = (process.env.API_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');
  return `${apiBase}/api/v1${path}`;
}

export type V1Meta = {
  request_id: string;
};

export type V1Response<T> = {
  data: T;
  meta: V1Meta;
};

export type V1ErrorBody = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details: unknown[];
  };
  meta: V1Meta;
};

/**
 * Error thrown by `fetchV1` when the server returns a non-2xx response.
 *
 * The `code` is the stable machine-readable identifier from the V1 error
 * envelope (`RESOURCE_NOT_FOUND`, `VALIDATION_FAILED`, ...). Callers
 * should branch on `code` for behaviour and surface `message` to users.
 */
export class V1ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: unknown[];

  constructor(
    code: string,
    status: number,
    retryable: boolean,
    details: unknown[],
    message: string,
  ) {
    super(message);
    this.name = 'V1ApiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

export interface FetchV1Options {
  /** AbortSignal for cancellation (e.g. React Suspense / route change). */
  signal?: AbortSignal;
  /**
   * Cookie header value, for server-side calls that need to forward the
   * user's session. Client-side calls rely on `credentials: 'include'`.
   */
  cookies?: string;
  init?: RequestInit;
}

/**
 * Fetch a V1 endpoint and unwrap the data payload.
 *
 * Browser calls use `NEXT_PUBLIC_API_URL`/the Next rewrite. Server Components
 * use `API_URL` because Node's fetch cannot resolve a relative `/api/...` URL.
 */
export async function fetchV1<T>(
  path: string,
  options?: FetchV1Options,
): Promise<T> {
  const url = buildV1ApiUrl(path);

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options?.cookies) {
    headers['Cookie'] = options.cookies;
  }

  // V1 is read-only for now; credentials are forwarded for future auth'd
  // endpoints, but no CSRF/phone-verification retry is wired up because
  // none of the current V1 endpoints require it.
  const response = await fetch(url, {
    method: options?.init?.method || 'GET',
    ...options?.init,
    headers: { ...headers, ...(options?.init?.headers as Record<string, string> | undefined) },
    signal: options?.signal,
    cache: 'no-store',
    credentials: options?.cookies ? undefined : 'include',
  });

  if (!response.ok) {
    let errorBody: V1ErrorBody | null = null;
    try {
      errorBody = (await response.json()) as V1ErrorBody;
    } catch {
      // Error body was not JSON (proxy HTML, empty body, ...). Fall back
      // to the status so the caller still gets a useful error.
    }

    if (errorBody && errorBody.error) {
      throw new V1ApiError(
        errorBody.error.code,
        response.status,
        errorBody.error.retryable,
        errorBody.error.details ?? [],
        errorBody.error.message,
      );
    }

    const fallbackRetryable = response.status >= 500;
    throw new V1ApiError(
      'HTTP_ERROR',
      response.status,
      fallbackRetryable,
      [],
      response.statusText || `HTTP ${response.status}`,
    );
  }

  const body = (await response.json()) as V1Response<T>;
  return body.data;
}

/** V1 mutation helper. Browser callers send cookies and the CSRF token already issued by the forum. */
export async function requestV1<T>(path: string, init: RequestInit): Promise<T> {
  let csrf = typeof document === 'undefined'
    ? undefined
    : document.cookie.split('; ').find((item) => item.startsWith('csrf_token='))?.slice('csrf_token='.length);
  // A direct visit to an admin page may be the first same-origin API contact in
  // this browser session. Ask the established auth endpoint to issue the token
  // before attempting a V1 mutation, matching the legacy client behaviour.
  if (!csrf && typeof document !== 'undefined') {
    await fetch(buildPublicApiUrl('/api/auth/check'), { credentials: 'include' }).catch(() => undefined);
    csrf = document.cookie.split('; ').find((item) => item.startsWith('csrf_token='))?.slice('csrf_token='.length);
  }
  return fetchV1<T>(path, {
    init: {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    },
  });
}

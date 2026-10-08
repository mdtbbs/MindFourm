import { getV1ErrorPublicMessage } from './v1-error-codes';

export type ApiV1Meta = { request_id: string; next_cursor?: string | null; pagination?: { page: number; limit: number; total: number; total_pages: number; has_more?: boolean } };

export type ApiV1Success<T> = {
  data: T;
  meta: ApiV1Meta;
};

export type ApiV1Error = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details: unknown[];
    documentation_url: string;
  };
  meta: ApiV1Meta;
};

export function apiV1Success<T>(data: T, requestId: string): ApiV1Success<T> {
  const value = data as any;
  const normalizePagination = (raw: any) => {
    if (!raw || !Number.isFinite(Number(raw.page)) || !Number.isFinite(Number(raw.limit))
      || !Number.isFinite(Number(raw.total))) return undefined;
    const totalPages = Number(raw.total_pages ?? raw.totalPages ?? Math.ceil(Number(raw.total) / Number(raw.limit)));
    return {
      page: Number(raw.page), limit: Number(raw.limit), total: Number(raw.total),
      total_pages: totalPages,
      has_more: typeof raw.has_more === 'boolean' ? raw.has_more : typeof raw.hasMore === 'boolean' ? raw.hasMore : Number(raw.page) < totalPages,
    };
  };
  // Arrays can carry pagination metadata without changing their published JSON
  // shape (JSON.stringify ignores non-enumerable properties).
  if (Array.isArray(value) && (value as any).__v1Pagination) {
    return { data, meta: { request_id: requestId, pagination: normalizePagination((value as any).__v1Pagination) } };
  }
  if (Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, '__v1NextCursor')) {
    return { data, meta: { request_id: requestId, next_cursor: (value as any).__v1NextCursor } };
  }
  if (value?.__v1Pagination) {
    const { __v1Pagination, ...payload } = value;
    return { data: payload as T, meta: { request_id: requestId, pagination: normalizePagination(__v1Pagination) } };
  }
  const pagination = normalizePagination(value?.pagination);
  if (pagination) return { data, meta: { request_id: requestId, pagination } };
  return { data, meta: { request_id: requestId } };
}

/**
 * Build a public V1 error body.
 *
 * `message` is a convenience for callers that have specific prose for this
 * request. Callers that only have the stable `code` (or that pass the code back
 * as the message, which is what an internal registry lookup degenerates into)
 * get the public English copy for that code instead — an English API must not
 * answer in the repository's primary language.
 */
export function apiV1Error(
  code: string,
  message: string,
  retryable: boolean,
  details: unknown[],
  requestId: string,
): ApiV1Error {
  const candidate = typeof message === 'string' ? message.trim() : '';
  const isMachineCode = candidate === '' || candidate === code || /^[A-Z0-9_]+$/.test(candidate);
  const resolved = isMachineCode ? getV1ErrorPublicMessage(code) : candidate;
  return {
    error: { code, message: resolved, retryable, details, documentation_url: v1ErrorDocumentationUrl(code) },
    meta: { request_id: requestId },
  };
}

export function v1ErrorCodeAnchor(code: string): string {
  return String(code).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function v1ErrorDocumentationUrl(code: string): string {
  return `https://mdtbbs.cn/api/v1/docs/errors#${v1ErrorCodeAnchor(code)}`;
}

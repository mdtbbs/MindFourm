export type ApiV1Meta = { request_id: string; pagination?: { page: number; limit: number; total: number; total_pages: number; has_more?: boolean } };

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
  if (value?.__v1Pagination) {
    const { __v1Pagination, ...payload } = value;
    return { data: payload as T, meta: { request_id: requestId, pagination: normalizePagination(__v1Pagination) } };
  }
  const pagination = normalizePagination(value?.pagination);
  if (pagination) return { data, meta: { request_id: requestId, pagination } };
  return { data, meta: { request_id: requestId } };
}

export function apiV1Error(
  code: string,
  message: string,
  retryable: boolean,
  details: unknown[],
  requestId: string,
): ApiV1Error {
  return { error: { code, message, retryable, details }, meta: { request_id: requestId } };
}

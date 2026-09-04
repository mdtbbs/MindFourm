import type { PostListResponse } from '@/types';

export type ApiPagination = PostListResponse['pagination'];

export type ApiPaginatedResult<
  TItem,
  TExtra extends Record<string, unknown> = Record<string, never>,
> = {
  data: TItem[];
  pagination: ApiPagination;
} & TExtra;

type SuccessEnvelope<T> = {
  success?: boolean;
  data?: T;
  pagination?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toPagination(value: unknown): ApiPagination | null {
  if (!isRecord(value)) {
    return null;
  }

  const page = toNumber(value.page);
  const limit = toNumber(value.limit);
  const total = toNumber(value.total);
  const totalPages = toNumber(value.totalPages);

  if (page === null || limit === null || total === null || totalPages === null) {
    return null;
  }

  return { page, limit, total, totalPages };
}

export function createEmptyPaginatedResult<
  TItem,
  TExtra extends Record<string, unknown> = Record<string, never>,
>(limit: number = 20, extra?: TExtra): ApiPaginatedResult<TItem, TExtra> {
  return {
    data: [],
    pagination: {
      page: 1,
      limit,
      total: 0,
      totalPages: 1,
    },
    ...(extra || ({} as TExtra)),
  };
}

export function unwrapApiPayload<T>(payload: unknown): T | null {
  if (!isRecord(payload)) {
    return payload as T;
  }

  if ('success' in payload && 'data' in payload) {
    const envelope = payload as SuccessEnvelope<T>;
    return envelope.success ? (envelope.data as T) : null;
  }

  return payload as T;
}

export function tryNormalizePaginatedApiPayload<
  TItem,
  TExtra extends Record<string, unknown> = Record<string, never>,
>(payload: unknown): ApiPaginatedResult<TItem, TExtra> | null {
  if (!isRecord(payload)) {
    return null;
  }

  if ('success' in payload && 'data' in payload && 'pagination' in payload) {
    const envelope = payload as SuccessEnvelope<unknown> & Record<string, unknown>;
    const pagination = toPagination(envelope.pagination);
    if (pagination && Array.isArray(envelope.data)) {
      const { success: _success, data, pagination: _pagination, ...rest } = envelope;
      return {
        ...(rest as TExtra),
        data: data as TItem[],
        pagination,
      };
    }
  }

  const inner = unwrapApiPayload<unknown>(payload);
  if (!isRecord(inner)) {
    return null;
  }

  if ('pagination' in inner) {
    const pagination = toPagination(inner.pagination);
    if (pagination && Array.isArray(inner.data)) {
      const { data, pagination: _pagination, ...rest } = inner;
      return {
        ...(rest as TExtra),
        data: data as TItem[],
        pagination,
      };
    }
  }

  if (Array.isArray(inner.data) && typeof inner.total === 'number') {
    const pagination = toPagination({
      page: inner.page,
      limit: inner.limit,
      total: inner.total,
      totalPages: inner.totalPages,
    });

    if (pagination) {
      const {
        data,
        page: _page,
        limit: _limit,
        total: _total,
        totalPages: _totalPages,
        ...rest
      } = inner;

      return {
        ...(rest as TExtra),
        data: data as TItem[],
        pagination,
      };
    }
  }

  return null;
}

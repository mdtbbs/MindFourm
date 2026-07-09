import 'server-only';

import { notFound } from 'next/navigation';
import {
  type ApiPaginatedResult,
  tryNormalizePaginatedApiPayload,
  unwrapApiPayload,
} from '@/lib/api/response';

const API_BASE = process.env.API_URL || 'http://localhost:4000';

type FetchOptions = Parameters<typeof fetch>[1];

type FetchApiOptions<T> = {
  fallback: T;
  init?: FetchOptions;
  notFoundOn404?: boolean;
};

function isNextNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message === 'NEXT_NOT_FOUND';
}

function handleHttpFailure(status: number, notFoundOn404?: boolean): void {
  if (notFoundOn404 && status === 404) {
    notFound();
  }
}

export async function fetchApiData<T>(
  path: string,
  options: FetchApiOptions<T>,
): Promise<T> {
  const { fallback, init, notFoundOn404 } = options;

  try {
    const res = await fetch(`${API_BASE}${path}`, init);
    if (!res.ok) {
      handleHttpFailure(res.status, notFoundOn404);
      return fallback;
    }

    const json = await res.json();
    return unwrapApiPayload<T>(json) ?? fallback;
  } catch (error) {
    if (isNextNotFoundError(error)) {
      throw error;
    }

    return fallback;
  }
}

export async function fetchApiPaginated<
  TItem,
  TExtra extends Record<string, unknown> = Record<string, never>,
>(
  path: string,
  options: FetchApiOptions<ApiPaginatedResult<TItem, TExtra>>,
): Promise<ApiPaginatedResult<TItem, TExtra>> {
  const { fallback, init, notFoundOn404 } = options;

  try {
    const res = await fetch(`${API_BASE}${path}`, init);
    if (!res.ok) {
      handleHttpFailure(res.status, notFoundOn404);
      return fallback;
    }

    const json = await res.json();
    return tryNormalizePaginatedApiPayload<TItem, TExtra>(json) ?? fallback;
  } catch (error) {
    if (isNextNotFoundError(error)) {
      throw error;
    }

    return fallback;
  }
}

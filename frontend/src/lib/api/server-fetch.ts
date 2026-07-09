import 'server-only';

import { notFound } from 'next/navigation';
import {
  type ApiPaginatedResult,
  tryNormalizePaginatedApiPayload,
  unwrapApiPayload,
} from '@/lib/api/response';

const API_BASE = process.env.API_URL || 'http://localhost:4000';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

type FetchOptions = Parameters<typeof fetch>[1];

type FetchApiOptions<T> = {
  fallback: T;
  init?: FetchOptions;
  notFoundOn404?: boolean;
};

function shouldSkipLocalApiFetchDuringBuild(): boolean {
  if (process.env.NEXT_ALLOW_LOCAL_API_BUILD_FETCH === '1') {
    return false;
  }

  if (process.env.npm_lifecycle_event !== 'build') {
    return false;
  }

  try {
    return LOOPBACK_HOSTS.has(new URL(API_BASE).hostname);
  } catch {
    return false;
  }
}

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

  if (shouldSkipLocalApiFetchDuringBuild()) {
    return fallback;
  }

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

  if (shouldSkipLocalApiFetchDuringBuild()) {
    return fallback;
  }

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

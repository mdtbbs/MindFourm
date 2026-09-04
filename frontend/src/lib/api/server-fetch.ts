import 'server-only';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  type ApiPaginatedResult,
  tryNormalizePaginatedApiPayload,
  unwrapApiPayload,
} from '@/lib/api/response';

const API_BASE = process.env.API_URL || 'http://localhost:4000';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

type FetchOptions = RequestInit;

type FetchApiOptions<T> = {
  fallback: T;
  init?: FetchOptions;
  notFoundOn404?: boolean;
  /** Throw request/response failures instead of returning the fallback value. */
  throwOnError?: boolean;
  /** Forward the current request's session cookie to the backend API. */
  forwardCookies?: boolean;
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
  const { fallback, init, notFoundOn404, forwardCookies, throwOnError } = options;

  if (shouldSkipLocalApiFetchDuringBuild()) {
    return fallback;
  }

  try {
    const headers = await buildHeaders(init?.headers, forwardCookies);
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    if (!res.ok) {
      handleHttpFailure(res.status, notFoundOn404);
      if (throwOnError) throw new Error(`请求失败（${res.status}）`);
      return fallback;
    }

    const json = await res.json();
    return unwrapApiPayload<T>(json) ?? fallback;
  } catch (error) {
    if (isNextNotFoundError(error)) {
      throw error;
    }

    if (throwOnError) throw error;
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
  const { fallback, init, notFoundOn404, forwardCookies, throwOnError } = options;

  if (shouldSkipLocalApiFetchDuringBuild()) {
    return fallback;
  }

  try {
    const headers = await buildHeaders(init?.headers, forwardCookies);
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    if (!res.ok) {
      handleHttpFailure(res.status, notFoundOn404);
      if (throwOnError) throw new Error(`请求失败（${res.status}）`);
      return fallback;
    }

    const json = await res.json();
    return tryNormalizePaginatedApiPayload<TItem, TExtra>(json) ?? fallback;
  } catch (error) {
    if (isNextNotFoundError(error)) {
      throw error;
    }

    if (throwOnError) throw error;
    return fallback;
  }
}

/**
 * Build request headers, optionally forwarding the session cookie.
 */
async function buildHeaders(
  existingHeaders: HeadersInit | undefined,
  forwardCookies?: boolean,
): Promise<HeadersInit | undefined> {
  const headersObj: Record<string, string> = {};
  if (existingHeaders instanceof Headers) {
    existingHeaders.forEach((v, k) => { headersObj[k] = v; });
  } else if (Array.isArray(existingHeaders)) {
    for (const [k, v] of existingHeaders) { headersObj[k] = v; }
  } else if (existingHeaders) {
    Object.assign(headersObj, existingHeaders);
  }

  const internalKey = process.env.FORUM_INTERNAL_API_KEY;
  if (internalKey) headersObj['X-Forum-Internal-Key'] = internalKey;
  if (!forwardCookies) return Object.keys(headersObj).length ? headersObj : undefined;

  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('forum_session');
    if (!sessionCookie) return existingHeaders;

    const cookieHeader = `forum_session=${sessionCookie.value}`;
    // Convert to a plain object and add the cookie
    headersObj['Cookie'] = cookieHeader;
    return headersObj;
  } catch {
    return existingHeaders;
  }
}

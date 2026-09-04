/**
 * V1 Threads API client.
 *
 * Fetches thread listings and individual threads from `/api/v1/threads`.
 * Returns the unwrapped `data` payload; the V1 envelope is handled by
 * the transport layer.
 */

import { fetchV1, type FetchV1Options } from './transport';

export type V1ThreadDto = {
  public_id: string | null;
  id: number;
  title: string;
  slug: string | null;
  status: string;
  is_pinned: boolean;
  is_locked: boolean;
  view_count: number;
  reply_count: number;
  created_at: string;
  updated_at: string;
  category_id: number | null;
  user_id: number;
};

export interface ListThreadsParams {
  limit?: number;
  offset?: number;
  category_id?: number;
}

export async function listThreads(
  params?: ListThreadsParams,
  options?: FetchV1Options,
): Promise<V1ThreadDto[]> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));
  if (params?.category_id) searchParams.set('category_id', String(params.category_id));
  const qs = searchParams.toString();
  return fetchV1<V1ThreadDto[]>(`/threads${qs ? '?' + qs : ''}`, options);
}

export async function getThread(
  id: number,
  options?: FetchV1Options,
): Promise<V1ThreadDto> {
  return fetchV1<V1ThreadDto>(`/threads/${id}`, options);
}

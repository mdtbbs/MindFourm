import type { UserRole } from '@/types';
import { requestJson } from '@/lib/api/request-json';
import type { ApiPagination } from '@/lib/api/response';

/** Max accepted by the backend DTO; the textarea enforces the same limit. */
export const BLOCK_REASON_MAX_LENGTH = 200;

/** The API returns a public projection, so private columns are absent by design. */
export interface BlockedUserSummary {
  id: number;
  username: string | null;
  avatar_url: string | null;
  role: UserRole | null;
}

export interface BlockedUserItem {
  id: number;
  reason: string | null;
  created_at: string;
  user: BlockedUserSummary;
}

/** Roles that cannot be blocked, so the entry point can hide itself for them. */
export function isStaffRole(role: UserRole | null | undefined): boolean {
  return role === 'moderator' || role === 'admin';
}

export const userBlockApi = {
  list: (params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.page !== undefined) query.set('page', String(params.page));
    if (params?.limit !== undefined) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return requestJson<{ data: BlockedUserItem[]; pagination: ApiPagination }>(
      `/api/user-blocks${suffix}`,
    );
  },

  /** Idempotent server-side: blocking someone already blocked succeeds unchanged. */
  block: (blockedId: number, reason?: string) =>
    requestJson<{ id: number }>('/api/user-blocks', {
      method: 'POST',
      body: JSON.stringify({ blocked_id: blockedId, ...(reason ? { reason } : {}) }),
    }),

  /** 404 when no block exists — callers should treat that as "already unblocked". */
  unblock: (blockedId: number) =>
    requestJson<{ message: string }>(`/api/user-blocks/${blockedId}`, { method: 'DELETE' }),
};

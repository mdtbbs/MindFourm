import type { User, Post, PostSummary, PostListResponse, CreatePostInput, Reply, ReplyListResponse, CreateReplyInput, Category, Tag, AdminLog, AdminStats, AdminBan, AdminBanListResponse, CreateBanInput, ModerationItem, UserProfile, Bookmark, BookmarkListResponse, Notification, NotificationListResponse, AdminNotification, AdminNotificationListResponse, Attachment, Message, Conversation, Resource, ResourceCategory, ResourceVersion, Server, ServerVersion, ServerTemplate, LikedPost, SearchHistoryEntry, SearchResultResponse, QuickCodeStatus, QuickCodeGenerateResponse, QuickCodeResetResponse, ResourceComment, ResourceCommentListResponse } from '@/types';
import { tryNormalizePaginatedApiPayload, unwrapApiPayload } from '@/lib/api/response';
import { requestPhoneVerification } from '@/lib/phone-verification/coordinator';
import { useToastStore } from '@/store/toast-store';

function normalizePublicApiBase(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

export function getPublicApiBase(): string {
  return normalizePublicApiBase(process.env.NEXT_PUBLIC_API_URL);
}

export function buildPublicApiUrl(path: string): string {
  return `${getPublicApiBase()}${path}`;
}

const API_BASE = getPublicApiBase();
const MINDAUTH_BASE = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';

class ApiRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = RequestInit & {
  skipPhoneVerificationRetry?: boolean;
  skipCache?: boolean;
};

/**
 * Create a request function that forwards cookies from the server-side request.
 * Usage in server components:
 *   const cookies = request.headers.get('cookie') || '';
 *   const api = createClientWithCookie(cookies);
 *   const profile = await api.userApi.getMyProfile();
 */
export function createClientWithCookie(cookie: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers['Cookie'] = cookie;

  return {
    request: async <T>(rawPath: string, options: RequestInit = {}): Promise<T> => {
      const path = resolveApiPath(rawPath);
      const method = options.method || 'GET';
      const isFormData = options.body instanceof FormData;
      const requestHeaders = isFormData
        ? { 'X-API-Version': '1', ...headers, ...(options.headers as Record<string, string> | undefined) }
        : { 'Content-Type': 'application/json', 'X-API-Version': '1', ...headers, ...(options.headers as Record<string, string> | undefined) };
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: withCsrfHeader(requestHeaders, String(method), cookie),
      });
      if (!res.ok) {
        let message = `Request failed: ${res.status}`;
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
        } catch {}
        throw new Error(message);
      }
      const data: unknown = await res.json();
      const paginated = tryNormalizePaginatedApiPayload<unknown, Record<string, unknown>>(data);
      if (paginated) {
        return paginated as T;
      }
      return unwrapApiPayload<T>(data) ?? (data as T);
    },
  };
}

// Simple in-memory cache for GET requests (client-side only)
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Bumped whenever the signed-in identity may have changed.
 *
 * The cache was keyed on the path alone, so after switching accounts in one tab the
 * previous user's `/api/auth/check`, `/api/users/me`, notifications and bookmarks
 * were served for up to 30 seconds. Including a generation in the key retires every
 * pre-existing entry at once, without having to enumerate them.
 */
let cacheGeneration = 0;

/**
 * Responses that belong to the current session and must never be served stale —
 * a 30-second window on these is visible to the user even within one session.
 */
const UNCACHEABLE_PREFIXES = [
  '/api/admin',
  '/api/auth/',
  '/api/users/me',
  '/api/notifications',
  '/api/bookmarks',
  '/api/messages',
  '/api/likes',
  '/api/follows',
  '/api/points/me',
];

/** Invalidate every cached response. Call when the signed-in user may have changed. */
export function resetApiCache(): void {
  cache.clear();
  cacheGeneration += 1;
}

function getCacheKey(path: string, options: RequestOptions): string | null {
  if (options.skipCache) return null;
  if (options.method && options.method !== 'GET') return null;
  if (UNCACHEABLE_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
  return `${cacheGeneration}:${options.method || 'GET'}:${path}`;
}

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

function invalidateCache(pathPrefix: string): void {
  for (const key of cache.keys()) {
    if (key.includes(pathPrefix)) cache.delete(key);
  }
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

function readCookieValue(name: string, cookieSource?: string): string | undefined {
  const source = cookieSource ?? (typeof document !== 'undefined' ? document.cookie : '');
  if (!source) return undefined;

  const prefix = `${name}=`;
  const pair = source
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!pair) return undefined;
  return decodeURIComponent(pair.slice(prefix.length));
}

function withCsrfHeader(
  headers: Record<string, string>,
  method: string,
  cookieSource?: string,
): Record<string, string> {
  if (!isWriteMethod(method)) {
    return headers;
  }

  const csrfToken = readCookieValue('csrf_token', cookieSource);
  if (!csrfToken) return headers;
  return { ...headers, 'X-CSRF-Token': csrfToken };
}

function isWriteMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

async function ensureClientCsrfToken(method: string): Promise<void> {
  if (!isWriteMethod(method) || typeof document === 'undefined' || readCookieValue('csrf_token')) {
    return;
  }

  await fetch(`${API_BASE}/api/auth/check`, {
    method: 'GET',
    credentials: 'include',
  }).catch(() => {
    // The write request will surface the actual failure if the token is still missing.
  });
}

/**
 * Ensure a request path carries the backend's global `/api` prefix.
 *
 * The NestJS app sets `setGlobalPrefix('api')`, but a number of call sites passed
 * bare paths like `/shop/items` — which 404'd permanently, and in production (where
 * NEXT_PUBLIC_API_URL is empty, so the path has to match the `/api/:path*` rewrite)
 * returned Next's own 404 HTML, surfacing as "Invalid JSON response". Every one of
 * those was wrapped in an empty catch, so the pages silently rendered empty states.
 *
 * Normalising here rather than only fixing the call sites means the mistake cannot
 * recur.
 */
function resolveApiPath(path: string): string {
  if (path.startsWith('/api/') || path === '/api') {
    return path;
  }
  if (!path.startsWith('/')) {
    return `/api/${path}`;
  }
  return `/api${path}`;
}

async function request<T>(
  rawPath: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipPhoneVerificationRetry: _skipPhoneVerificationRetry, skipCache: _skipCache, ...fetchOptions } = options;
  const path = resolveApiPath(rawPath);
  const method = fetchOptions.method || 'GET';
  const cacheKey = getCacheKey(path, options);

  // Return cached data for GET requests
  if (cacheKey) {
    const cached = getCached<T>(cacheKey);
    if (cached !== null) return cached;
  }

  const isFormData = fetchOptions.body instanceof FormData;

  let res: Response;
  try {
    await ensureClientCsrfToken(String(method));
    const requestHeaders = isFormData
      ? { 'X-API-Version': '1', ...(fetchOptions.headers as Record<string, string> | undefined) }
      : { 'Content-Type': 'application/json', 'X-API-Version': '1', ...(fetchOptions.headers as Record<string, string> | undefined) };
    res = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers: withCsrfHeader(requestHeaders, String(method)),
      credentials: 'include',
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Network error');
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    let code: string | undefined;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
      if (data?.code) code = data.code;
    } catch {
      // Response body is not JSON, use default message
    }

    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method).toUpperCase());
    if (code === 'PHONE_NOT_VERIFIED' && isWrite && !options.skipPhoneVerificationRetry) {
      useToastStore.getState().showWarning('请先验证手机号，验证成功后会自动继续本次操作');
      const verified = await requestPhoneVerification();
      if (verified) {
        return request<T>(path, { ...options, skipPhoneVerificationRetry: true });
      }
    }

    throw new ApiRequestError(message, res.status, code);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Invalid JSON response');
  }

  const paginated = tryNormalizePaginatedApiPayload<unknown, Record<string, unknown>>(data);
  if (paginated) {
    if (cacheKey) setCache(cacheKey, paginated);
    return paginated as T;
  }

  // Handle wrapped responses
  if (typeof data === 'object' && data !== null && 'success' in data && 'data' in data) {
    const d = data as { data: unknown; pagination?: unknown };
    if (d.pagination !== undefined) {
      const result = { data: d.data, pagination: d.pagination } as T;
      if (cacheKey) setCache(cacheKey, result);
      return result;
    }
    const inner = d.data;
    if (typeof inner === 'object' && inner !== null && 'pagination' in inner) {
      const result = inner as T;
      if (cacheKey) setCache(cacheKey, result);
      return result;
    }
    // Normalize flat pagination format: { data: [...], total, page, limit, totalPages }
    // → { data: [...], pagination: { total, page, limit, totalPages } }
    if (typeof inner === 'object' && inner !== null && !Array.isArray(inner)) {
      const innerObj = inner as Record<string, unknown>;
      if (Array.isArray(innerObj.data) && typeof innerObj.total === 'number') {
        const { data: items, total, page, limit, totalPages, ...rest } = innerObj;
        const normalized = { data: items, pagination: { total, page, limit, totalPages }, ...rest } as T;
        if (cacheKey) setCache(cacheKey, normalized);
        return normalized;
      }
    }
    const result = d.data as T;
    if (cacheKey) setCache(cacheKey, result);
    return result;
  }

  const result = unwrapApiPayload<T>(data) ?? (data as T);
  if (cacheKey) setCache(cacheKey, result);
  return result;
}

// Clear cache after mutations
function clearCache(): void {
  cache.clear();
}

// Public settings (no auth)
export const settingsApi = {
  get: (options?: { fresh?: boolean }) =>
    request<Record<string, string>>('/api/settings', { skipCache: options?.fresh }),
};

// Auth APIs
export const authApi = {
  check: () => request<{ authenticated: boolean; user?: User; needs_terms_acceptance?: boolean }>('/api/auth/check'),
  syncPhoneStatus: () =>
    request<{ user: User }>('/api/auth/sync-phone-status', {
      method: 'POST',
    }),
  logout: async () => {
    const results = await Promise.allSettled([
      request<void>('/api/auth/logout', { method: 'POST' }),
      mindAuthRequest<{ success: boolean }>('/api/logout', {}),
    ]);

    const failed = results.find((result) => result.status === 'rejected');
    if (failed && results.every((result) => result.status === 'rejected')) {
      throw (failed as PromiseRejectedResult).reason;
    }
  },
};

async function getMindAuthCsrfToken(): Promise<string> {
  const res = await fetch(`${MINDAUTH_BASE}/api/csrf-token`, {
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok || !data?.csrf_token) {
    throw new Error(data?.message || '获取验证令牌失败');
  }
  return data.csrf_token;
}

async function mindAuthRequest<T>(path: string, body: unknown): Promise<T> {
  const csrfToken = await getMindAuthCsrfToken();
  const res = await fetch(`${MINDAUTH_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiRequestError(data?.message || `Request failed: ${res.status}`, res.status, data?.code);
  }
  return data as T;
}

export const smsApi = {
  send: (phone: string) =>
    mindAuthRequest<{ success: boolean; message: string; code?: string; phone_verified?: boolean }>('/api/sms/send', { phone }),
  verify: (phone: string, code: string) =>
    mindAuthRequest<{ success: boolean; message: string; phone_verified: boolean }>(
      '/api/sms/verify',
      { phone, code },
    ),
};

// Post APIs
export const postApi = {
  getList: (params?: { page?: number; limit?: number; category_id?: number; user_id?: number; search?: string }) =>
    request<PostListResponse>(`/api/posts${buildQueryString({
      page: params?.page,
      limit: params?.limit,
      category_id: params?.category_id,
      user_id: params?.user_id,
      search: params?.search,
    })}`),
  getListCursor: (params?: { cursor?: string; limit?: number; category_id?: number; search?: string }) =>
    request<{ data: PostSummary[]; nextCursor: string | null; hasMore: boolean }>(`/api/posts/cursor${buildQueryString({
      cursor: params?.cursor,
      limit: params?.limit,
      category_id: params?.category_id,
      search: params?.search,
    })}`),
  getById: (id: number) => request<Post>(`/api/posts/${id}`),
  create: (input: CreatePostInput) => {
    clearCache();
    return request<Post>('/api/posts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update: (id: number, input: Partial<CreatePostInput>) => {
    clearCache();
    return request<Post>(`/api/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  delete: (id: number) => {
    clearCache();
    return request<void>(`/api/posts/${id}`, { method: 'DELETE' });
  },
  setLocked: (id: number, locked: boolean) => {
    clearCache();
    return request<{ id: number; is_locked: boolean }>(`/api/posts/${id}/lock`, {
      method: 'PUT',
      body: JSON.stringify({ locked }),
    });
  },
  /** `null` clears the mark. */
  setBestReply: (id: number, replyId: number | null) => {
    clearCache();
    return request<{ id: number; best_reply_id: number | null }>(`/api/posts/${id}/best-reply`, {
      method: 'PUT',
      body: JSON.stringify({ reply_id: replyId }),
    });
  },
  revisions: (id: number, params?: { page?: number; limit?: number }) =>
    request<{
      data: PostRevisionSummary[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/posts/${id}/revisions${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
  revision: (id: number, revisionId: number) =>
    request<PostRevisionDetail>(`/api/posts/${id}/revisions/${revisionId}`),
};

export interface PostRevisionSummary {
  id: number;
  post_id: number;
  title: string;
  editor: { id: number; username: string | null } | null;
  created_at: string;
}

export interface PostRevisionDetail extends PostRevisionSummary {
  content: string;
}

// Reply APIs
export const replyApi = {
  getByPost: (postId: number, params?: { page?: number; limit?: number }) =>
    request<ReplyListResponse>(`/api/posts/${postId}/replies${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
  create: (postId: number, input: CreateReplyInput) => {
    clearCache();
    return request<Reply>(`/api/posts/${postId}/replies`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update: (id: number, content: string) => {
    clearCache();
    return request<Reply>(`/api/replies/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  },
  delete: (id: number) => {
    clearCache();
    return request<void>(`/api/replies/${id}`, { method: 'DELETE' });
  },
};

// Category APIs
export const categoryApi = {
  getList: () => request<Category[]>('/api/categories'),
  getById: (id: number) => request<Category>(`/api/categories/${id}`),
};

// Tag APIs
export const tagApi = {
  getList: () => request<Tag[]>('/api/tags'),
  getPostsByTag: (slug: string, page?: number) =>
    request<PostListResponse>(`/api/tags/${slug}/posts${buildQueryString({ page })}`),
};

// Admin APIs
export const adminApi = {
  getPosts: (params?: { page?: number; limit?: number; status?: string; category_id?: number }) =>
    request<{ data: Post[]; pagination: PostListResponse['pagination'] }>(
      `/api/admin/posts${buildQueryString({
        page: params?.page,
        limit: params?.limit,
        status: params?.status,
        category_id: params?.category_id,
      })}`
    ),
  createCategory: (data: { name: string; slug: string; sort_order?: number }) => {
    clearCache();
    return request<Category>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateCategory: (id: number, data: { name: string; slug: string; sort_order?: number }) => {
    clearCache();
    return request<Category>(`/api/admin/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  deleteCategory: (id: number) => {
    clearCache();
    return request<void>(`/api/admin/categories/${id}`, { method: 'DELETE' });
  },
  updateUserRole: (id: number, role: 'user' | 'moderator' | 'admin') =>
    request<User>(`/api/admin/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  pinPost: (id: number, isPinned: boolean) => {
    clearCache();
    return request<Post>(`/api/admin/posts/${id}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ is_pinned: isPinned ? 1 : 0 }),
    });
  },
  movePost: (id: number, category_id: number) => {
    clearCache();
    return request<Post>(`/api/admin/posts/${id}/move`, {
      method: 'PUT',
      body: JSON.stringify({ category_id }),
    });
  },
  getLogs: (params?: { page?: number; limit?: number }) =>
    request<{ data: AdminLog[]; pagination: PostListResponse['pagination'] }>(
      `/api/admin/logs${buildQueryString({ page: params?.page, limit: params?.limit })}`
    ),
  getUsers: (params?: { page?: number; limit?: number; search?: string }) =>
    request<{ data: User[]; pagination: PostListResponse['pagination'] }>(
      `/api/admin/users${buildQueryString({ page: params?.page, limit: params?.limit, search: params?.search })}`
    ),
  getStats: () =>
    request<AdminStats>('/api/admin/stats'),
  getBadgeCounts: () =>
    request<{ moderation_pending: number; announce_active: number }>('/api/admin/badge-counts'),
  getSettings: (category?: string) =>
    request<Record<string, string>>(`/api/admin/settings${category ? `/${category}` : ''}`),
  updateSettings: async (category: string, data: Record<string, string>) => {
    const result = await request<Record<string, string>>(`/api/admin/settings/${category}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    invalidateCache('/api/settings');
    invalidateCache('/api/admin/settings');
    return result;
  },
  uploadSiteLogo: (formData: FormData) => {
    clearCache();
    return request<{ url: string; filename: string; original_name: string; mime_type: string; size: number }>(
      '/api/admin/settings/brand/site-logo',
      {
        method: 'POST',
        body: formData,
      },
    );
  },
  uploadSiteFavicon: (formData: FormData) => {
    clearCache();
    return request<{ url: string; filename: string; original_name: string; mime_type: string; size: number }>(
      '/api/admin/settings/brand/site-favicon',
      {
        method: 'POST',
        body: formData,
      },
    );
  },
  getTags: (params?: { page?: number; limit?: number }) =>
    request<{ data: Tag[]; pagination: PostListResponse['pagination'] }>('/api/admin/tags' + buildQueryString(params || {})),
  createTag: (data: { name: string; slug?: string }) => {
    clearCache();
    return request<Tag>('/api/admin/tags', { method: 'POST', body: JSON.stringify(data) });
  },
  updateTag: (id: number, data: { name?: string; slug?: string }) => {
    clearCache();
    return request<Tag>(`/api/admin/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteTag: (id: number) => {
    clearCache();
    return request<void>(`/api/admin/tags/${id}`, { method: 'DELETE' });
  },
  mergeTags: (from_tag_id: number, to_tag_id: number) => {
    clearCache();
    return request<{ message: string }>('/api/admin/tags/merge', {
      method: 'POST', body: JSON.stringify({ from_tag_id, to_tag_id }),
    });
  },
  getModeration: (params?: { page?: number; limit?: number; type?: string }) =>
    request<{ data: ModerationItem[]; pagination: PostListResponse['pagination'] }>(
      `/api/admin/moderation${buildQueryString({ page: params?.page, limit: params?.limit, type: params?.type })}`
    ),
  approvePost: (id: number, type: string = 'post') => {
    clearCache();
    return request<{ message: string }>(`/api/admin/moderation/${id}/approve`, {
      method: 'PUT',
      body: JSON.stringify({ type }),
    });
  },
  rejectPost: (id: number, type: string = 'post', reason?: string) => {
    clearCache();
    return request<{ message: string }>(`/api/admin/moderation/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ type, reason }),
    });
  },
  getBans: (params?: { page?: number; limit?: number; ban_type?: string; is_active?: string }) =>
    request<AdminBanListResponse>(`/api/admin/bans${buildQueryString({ page: params?.page, limit: params?.limit, ban_type: params?.ban_type, is_active: params?.is_active })}`),
  createBan: (data: CreateBanInput) =>
    request<AdminBan>('/api/admin/bans', { method: 'POST', body: JSON.stringify(data) }),
  updateBan: (id: number, data: Partial<CreateBanInput>) =>
    request<AdminBan>(`/api/admin/bans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivateBan: (id: number) =>
    request<AdminBan>(`/api/admin/bans/${id}`, { method: 'DELETE' }),
  cleanupSessions: () =>
    request<{ message: string }>('/api/admin/cleanup/sessions', { method: 'POST' }),
  cleanupLogs: () =>
    request<{ message: string }>('/api/admin/cleanup/logs', { method: 'POST' }),
  cleanupSoftDeleted: () =>
    request<{ message: string }>('/api/admin/cleanup/soft-deleted', { method: 'POST' }),
  listExternalApiKeys: (params?: { page?: number; limit?: number; enabled?: boolean }) =>
    request<any>(`/api/admin/external-api/keys${buildQueryString({
      page: params?.page,
      limit: params?.limit,
      enabled: params?.enabled === undefined ? undefined : String(params.enabled),
    })}`),
  createExternalApiKey: (data: {
    name: string;
    scopes: string[];
    allowed_ips?: string[];
    default_user_id?: number;
    rate_limit_per_minute?: number;
    expires_at?: string;
  }) => request<any>('/api/admin/external-api/keys', { method: 'POST', body: JSON.stringify(data) }),
  updateExternalApiKey: (id: number, data: Record<string, unknown>) =>
    request<any>(`/api/admin/external-api/keys/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  rotateExternalApiKey: (id: number) =>
    request<any>(`/api/admin/external-api/keys/${id}/rotate`, { method: 'POST' }),
  enableExternalApiKey: (id: number) =>
    request<any>(`/api/admin/external-api/keys/${id}/enable`, { method: 'POST' }),
  disableExternalApiKey: (id: number) =>
    request<any>(`/api/admin/external-api/keys/${id}/disable`, { method: 'POST' }),
  listExternalApiAuditLogs: (params?: { page?: number; limit?: number; api_key_id?: number; actor_user_id?: number; action?: string; status?: string }) =>
    request<any>(`/api/admin/external-api/audit-logs${buildQueryString({
      page: params?.page,
      limit: params?.limit,
      api_key_id: params?.api_key_id,
      actor_user_id: params?.actor_user_id,
      action: params?.action,
      status: params?.status,
    })}`),
  bulkDeletePosts: (post_ids: number[]) => {
    clearCache();
    return request<{ message: string }>('/api/admin/posts', { method: 'DELETE', body: JSON.stringify({ post_ids }) });
  },
  bulkPinPosts: (post_ids: number[], is_pinned: boolean) => {
    clearCache();
    return request<{ message: string }>('/api/admin/posts/pin', {
      method: 'PUT',
      body: JSON.stringify({ post_ids, is_pinned: is_pinned ? 1 : 0 }),
    });
  },
  bulkMovePosts: (post_ids: number[], category_id: number) => {
    clearCache();
    return request<{ message: string }>('/api/admin/posts/move', { method: 'PUT', body: JSON.stringify({ post_ids, category_id }) });
  },
  // Plugin management
  getPlugins: () => request<any[]>('/api/plugins'),
  getPlugin: (slug: string) => request<any>(`/api/plugins/${slug}`),
  installPlugin: (metadata: { name: string; slug: string; version: string; description?: string; author?: string }) => {
    clearCache();
    return request<any>('/api/plugins/install', { method: 'POST', body: JSON.stringify(metadata) });
  },
  uninstallPlugin: (slug: string) => {
    clearCache();
    return request<any>(`/api/plugins/${slug}`, { method: 'DELETE' });
  },
  enablePlugin: (slug: string) => {
    clearCache();
    return request<any>(`/api/plugins/${slug}/enable`, { method: 'POST' });
  },
  disablePlugin: (slug: string) => {
    clearCache();
    return request<any>(`/api/plugins/${slug}/disable`, { method: 'POST' });
  },
  getPluginConfig: (slug: string) => request<any>(`/api/plugins/${slug}/config`),
  updatePluginConfig: (slug: string, config: Record<string, any>) =>
    request<any>(`/api/plugins/${slug}/config`, { method: 'PUT', body: JSON.stringify({ config }) }),
  getPluginHooks: (slug: string) => request<any>(`/api/plugins/${slug}/hooks`),
};

// Sidebar Navigation API
export interface SidebarNavigationItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  enabled: boolean;
  requiresAuth: boolean;
  featureKey?: string;
}

export const sidebarNavApi = {
  get: () =>
    request<SidebarNavigationItem[]>('/api/settings/admin/sidebar-navigation'),
  update: (items: SidebarNavigationItem[]) => {
    clearCache();
    return request<{ success: boolean }>('/api/settings/admin/sidebar-navigation', {
      method: 'PUT',
      body: JSON.stringify({ items }),
    });
  },
};

// Levels API
export const levelsApi = {
  getAll: () => request<any[]>('/api/levels'),
  getUserLevel: (userId: number) => request<any>(`/api/levels/user/${userId}`),
  adminGetAll: () => request<any[]>('/api/levels/admin'),
  adminCreate: (data: { name: string; slug: string; min_points: number; max_points?: number; color?: string; description?: string; sort_order?: number }) => {
    clearCache();
    return request<any>('/api/levels/admin', { method: 'POST', body: JSON.stringify(data) });
  },
  adminUpdate: (id: number, data: Partial<{ name: string; slug: string; min_points: number; max_points: number | undefined; color: string; description: string; sort_order: number }>) => {
    clearCache();
    return request<any>(`/api/levels/admin/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  adminDelete: (id: number) => {
    clearCache();
    return request<{ message: string }>(`/api/levels/admin/${id}`, { method: 'DELETE' });
  },
};

// Badges API
export const badgesApi = {
  getAll: () => request<any[]>('/api/badges'),
  getUserBadges: (userId: number) => request<any[]>(`/api/badges/user/${userId}`),
  adminGetAll: () => request<any[]>('/api/badges/admin'),
  adminCreate: (data: { name: string; slug: string; icon?: string; description?: string; level?: string; criteria?: string; is_active?: number }) => {
    clearCache();
    return request<any>('/api/badges/admin', { method: 'POST', body: JSON.stringify(data) });
  },
  adminUpdate: (id: number, data: any) => {
    clearCache();
    return request<any>(`/api/badges/admin/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  adminDelete: (id: number) => {
    clearCache();
    return request<{ message: string }>(`/api/badges/admin/${id}`, { method: 'DELETE' });
  },
  adminAward: (user_id: number, badge_id: number) => {
    clearCache();
    return request<any>('/api/badges/admin/award', { method: 'POST', body: JSON.stringify({ user_id, badge_id }) });
  },
};

// Groups API
export interface Group {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_system: number;
  member_count?: number;
}

export interface GroupMember {
  id: number;
  username: string;
  avatar_url: string | null;
  role: 'member' | 'moderator' | 'admin';
  joined_at: string;
}

export interface GroupInput {
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  color?: string;
  sort_order?: number;
}

export const groupsApi = {
  getAll: () => request<Group[]>('/api/groups'),
  getMy: () => request<Group[]>('/api/groups/my'),
  join: (id: number) => request<void>(`/api/groups/${id}/join`, { method: 'POST' }),
  leave: (id: number) => request<void>(`/api/groups/${id}/leave`, { method: 'POST' }),
};

export const groupsAdminApi = {
  getAll: () => request<Group[]>('/api/groups/admin'),
  getMembers: (slug: string) => request<{ members: GroupMember[]; total: number }>(`/api/groups/${encodeURIComponent(slug)}/members`),
  create: (data: GroupInput) => {
    clearCache();
    return request<Group>('/api/groups/admin', { method: 'POST', body: JSON.stringify(data) });
  },
  update: (id: number, data: Partial<GroupInput>) => {
    clearCache();
    return request<Group>(`/api/groups/admin/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  delete: (id: number) => {
    clearCache();
    return request<{ message: string }>(`/api/groups/admin/${id}`, { method: 'DELETE' });
  },
  addMember: (groupId: number, data: { user_id: number; role: GroupMember['role'] }) => {
    clearCache();
    return request<GroupMember>(`/api/groups/admin/${groupId}/members`, { method: 'POST', body: JSON.stringify(data) });
  },
  removeMember: (groupId: number, userId: number) => {
    clearCache();
    return request<{ message: string }>(`/api/groups/admin/${groupId}/members/${userId}`, { method: 'DELETE' });
  },
};

// User APIs
export const userApi = {
  getById: (id: number) => request<UserProfile>(`/api/users/${id}`),
  search: (q: string, limit: number = 10) =>
    request<Array<Pick<UserProfile, 'id' | 'username' | 'avatar_url'>>>(`/api/users/search${buildQueryString({ q, limit })}`),
  getMyProfile: () => request<UserProfile>('/api/users/me'),
  updateProfile: (data: { username?: string; bio?: string }) =>
    request<UserProfile>('/api/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  uploadAvatar: (formData: FormData) =>
    request<UserProfile>('/api/users/me/avatar', {
      method: 'POST',
      body: formData,
    }),
  removeAvatar: () =>
    request<UserProfile>('/api/users/me/avatar', { method: 'DELETE' }),
  getMyReplies: (params?: { page?: number; limit?: number }) =>
    request<ReplyListResponse>(`/api/users/me/replies${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
};

// Bookmark APIs
export const bookmarkApi = {
  list: (params?: { page?: number; limit?: number }) =>
    request<BookmarkListResponse>(`/api/bookmarks${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
  check: async (postId: number) => {
    const res = await request<{ isBookmarked: boolean }>(`/api/bookmarks/check/${postId}`);
    return { bookmarked: res.isBookmarked };
  },
  add: (postId: number) =>
    request<Bookmark>(`/api/bookmarks/${postId}`, { method: 'POST' }),
  remove: (postId: number) =>
    request<void>(`/api/bookmarks/${postId}`, { method: 'DELETE' }),
};

// Report APIs
/** Kept beside the client so the labels and the values the API accepts cannot drift. */
export const REPORT_REASONS = [
  { value: 'spam', label: '垃圾广告' },
  { value: 'abuse', label: '人身攻击 / 辱骂' },
  { value: 'porn', label: '色情低俗' },
  { value: 'illegal', label: '违法违规' },
  { value: 'off_topic', label: '与版块无关' },
  { value: 'copyright', label: '侵权' },
  { value: 'other', label: '其他' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];
export type ReportTargetType = 'post' | 'reply' | 'resource' | 'user';

export interface MyReport {
  id: number;
  target_type: string;
  target_id: number;
  reason: string;
  status: string;
  resolution_note: string | null;
  created_at: string;
}

export interface AdminReport {
  id: number;
  target_type: string;
  target_id: number;
  reason: string;
  detail: string | null;
  status: string;
  resolution_note: string | null;
  handled_at: string | null;
  created_at: string;
  reporter: { id: number; username: string | null } | null;
  handler: { id: number; username: string | null } | null;
}

export const adminReportApi = {
  list: (params?: { status?: string; target_type?: string; page?: number; limit?: number }) =>
    request<{
      data: AdminReport[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/admin/reports${buildQueryString({
      status: params?.status,
      target_type: params?.target_type,
      page: params?.page,
      limit: params?.limit,
    })}`),
  resolve: (id: number, input: { status: 'resolved' | 'dismissed'; resolution_note?: string }) => {
    clearCache();
    return request<AdminReport>(`/api/admin/reports/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
};

export const reportApi = {
  create: (input: {
    target_type: ReportTargetType;
    target_id: number;
    reason: ReportReason;
    detail?: string;
  }) =>
    request<{ id: number }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  mine: (params?: { page?: number; limit?: number }) =>
    request<{
      data: MyReport[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/reports/mine${buildQueryString({ page: params?.page, limit: params?.limit })}`),
};

// Notification APIs
export const notificationApi = {
  list: (params?: { page?: number; limit?: number; filter?: 'all' | 'unread' | 'read' }) =>
    request<NotificationListResponse>(`/api/notifications${buildQueryString({
      page: params?.page,
      limit: params?.limit,
      // Filtering server side keeps `pagination.total` describing the rows returned.
      filter: params?.filter,
    })}`),
  listCursor: (params?: { cursor?: string; limit?: number }) =>
    request<{ data: Notification[]; nextCursor: string | null }>(`/api/notifications/cursor${buildQueryString({
      cursor: params?.cursor,
      limit: params?.limit,
    })}`),
  unreadCount: () =>
    request<{ count: number }>('/api/notifications/unread-count'),
  markAsRead: (id: number) =>
    request<void>(`/api/notifications/${id}/read`, { method: 'PUT' }),
  markAllAsRead: () =>
    request<void>('/api/notifications/read-all', { method: 'PUT' }),
  getEmailPreference: () =>
    request<{
      reply_email: boolean;
      mention_email: boolean;
      message_email: boolean;
      system_email: boolean;
      digest_email: boolean;
    }>('/api/notifications/email-preference'),
  updateEmailPreference: (data: {
    reply_email?: boolean;
    mention_email?: boolean;
    message_email?: boolean;
    system_email?: boolean;
    digest_email?: boolean;
  }) =>
    request<{
      reply_email: boolean;
      mention_email: boolean;
      message_email: boolean;
      system_email: boolean;
      digest_email: boolean;
    }>('/api/notifications/email-preference', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

export const adminNotificationApi = {
  list: (params?: { page?: number; limit?: number }) =>
    request<AdminNotificationListResponse>(`/api/admin/notifications${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
  unreadCount: () =>
    request<{ count: number }>('/api/admin/notifications/unread-count'),
  markAsRead: (id: number) =>
    request<void>(`/api/admin/notifications/${id}/read`, { method: 'PUT' }),
  markAllAsRead: () =>
    request<void>('/api/admin/notifications/read-all', { method: 'PUT' }),
};

// Like APIs
export const likeApi = {
  // Post likes
  likePost: (postId: number) =>
    request<{ message: string }>(`/api/likes/posts/${postId}`, { method: 'POST' }),
  unlikePost: (postId: number) =>
    request<{ message: string }>(`/api/likes/posts/${postId}`, { method: 'DELETE' }),
  checkPostLike: (postId: number) =>
    request<{ liked: boolean; count: number }>(`/api/likes/posts/${postId}`),
  getLikedPosts: (params?: { page?: number; limit?: number }) =>
    request<{ data: LikedPost[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
      `/api/likes/posts${buildQueryString({ page: params?.page, limit: params?.limit })}`
    ),

  // Reply likes
  likeReply: (replyId: number) =>
    request<{ message: string }>(`/api/likes/replies/${replyId}`, { method: 'POST' }),
  unlikeReply: (replyId: number) =>
    request<{ message: string }>(`/api/likes/replies/${replyId}`, { method: 'DELETE' }),
  checkReplyLike: (replyId: number) =>
    request<{ liked: boolean; count: number }>(`/api/likes/replies/${replyId}`),

  // User statistics
  getUserLikeCount: (userId: number) =>
    request<{ count: number }>(`/api/likes/users/${userId}/count`),
};

// Attachment APIs
export const attachmentApi = {
  upload: (formData: FormData) =>
    request<{ message: string; attachments: Attachment[] }>('/api/attachments/upload', {
      method: 'POST',
      body: formData,
    }),
  getByPost: (postId: number) =>
    request<Attachment[]>(`/api/attachments/post/${postId}`),
  download: (id: number) => `${API_BASE}/api/attachments/${id}/download`,
};

// Message APIs
export const messageApi = {
  send: (recipient_id: number, content: string) =>
    request<Message>('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ recipient_id, content }),
    }),
  getConversations: (params?: { cursor?: string; limit?: number }) =>
    request<{ data: Conversation[]; nextCursor: string | null; hasMore: boolean }>(
      `/api/messages${buildQueryString({ cursor: params?.cursor, limit: params?.limit })}`
    ),
  getConversation: (userId: number, params?: { cursor?: string; limit?: number }) =>
    request<{ data: Message[]; nextCursor: string | null; hasMore: boolean }>(
      `/api/messages/${userId}${buildQueryString({ cursor: params?.cursor, limit: params?.limit })}`
    ),
  unreadCount: () =>
    request<{ count: number }>('/api/messages/unread-count'),
  delete: (id: number) =>
    request<void>(`/api/messages/${id}`, { method: 'DELETE' }),
};

// Resource APIs
export const resourceApi = {
  list: (params?: { cursor?: string; limit?: number; category_id?: number; search?: string; sort?: string }) =>
    request<{ data: Resource[]; next_cursor: string | null; has_more: boolean }>(
      `/api/resources${buildQueryString({ cursor: params?.cursor, limit: params?.limit, category_id: params?.category_id, search: params?.search, sort: params?.sort })}`
    ),
  getById: (id: number) =>
    request<Resource>(`/api/resources/${id}`),
  download: (id: number, versionId?: number | null) =>
    `${API_BASE}/api/resources/${id}/download${versionId ? `?version_id=${versionId}` : ''}`,
  upload: (formData: FormData) =>
    request<Resource>('/api/resources', {
      method: 'POST',
      body: formData,
    }),
  update: (id: number, data: Partial<Resource>) => {
    clearCache();
    return request<Resource>(`/api/resources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  delete: (id: number) => {
    clearCache();
    return request<void>(`/api/resources/${id}`, { method: 'DELETE' });
  },
  getCategories: () =>
    request<ResourceCategory[]>('/api/resources/categories'),
  getVersions: (id: number) =>
    request<ResourceVersion[]>(`/api/resources/${id}/versions`),
  addVersion: (id: number, formData: FormData) => {
    clearCache();
    return request<ResourceVersion>(`/api/resources/${id}/versions`, {
      method: 'POST',
      body: formData,
    });
  },
  deleteVersion: (id: number, versionId: number) => {
    clearCache();
    return request<void>(`/api/resources/${id}/versions/${versionId}`, { method: 'DELETE' });
  },
  getUserRating: (id: number) =>
    request<{ rating: number | null }>(`/api/resources/${id}/rating`),
  upsertRating: (id: number, rating: number) => {
    clearCache();
    return request<Resource>(`/api/resources/${id}/rating`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
  },
  deleteRating: (id: number) => {
    clearCache();
    return request<void>(`/api/resources/${id}/rating`, { method: 'DELETE' });
  },
  getMyResources: (params?: { cursor?: string; limit?: number }) =>
    request<{ data: Resource[]; next_cursor: string | null; has_more: boolean }>(
      `/api/resources/my${buildQueryString({ cursor: params?.cursor, limit: params?.limit })}`
    ),
  getHot: () => request<Resource[]>('/api/resources/hot'),
};

// Resource Category Admin APIs
export const resourceCategoryApi = {
  list: () => request<ResourceCategory[]>('/api/resources/categories/admin'),
  create: (data: Omit<ResourceCategory, 'id' | 'created_at'>) => {
    clearCache();
    return request<ResourceCategory>('/api/resources/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  update: (id: number, data: Partial<ResourceCategory>) => {
    clearCache();
    return request<ResourceCategory>(`/api/resources/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  delete: (id: number) => {
    clearCache();
    return request<void>(`/api/resources/categories/${id}`, { method: 'DELETE' });
  },
};

// Resource Admin APIs
export const resourceAdminApi = {
  list: (params?: { cursor?: string; limit?: number; status?: string; category_id?: number; search?: string; sort?: string }) =>
    request<{ data: Resource[]; next_cursor: string | null; has_more: boolean }>(
      `/api/resources/admin${buildQueryString({ cursor: params?.cursor, limit: params?.limit, status: params?.status, category_id: params?.category_id, search: params?.search, sort: params?.sort })}`
    ),
  updateStatus: (id: number, status: string, rejectReason?: string) => {
    clearCache();
    return request<Resource>(`/api/resources/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, reject_reason: rejectReason }),
    });
  },
  delete: (id: number) => {
    clearCache();
    return request<void>(`/api/resources/${id}/admin`, { method: 'DELETE' });
  },
};

// Server APIs (EasyManager integration)
export const serverApi = {
  getPublicServers: () =>
    request<{ servers: Server[] }>('/api/servers/public'),
  getServerBasic: (id: number) =>
    request<{ server: Server }>(`/api/servers/${id}/basic`),
  getUserServers: () =>
    request<{ servers: Server[] }>('/api/servers/my'),
  applyServer: (data: { name: string; description?: string; version: string; template_id?: number }) =>
    request<{ server_id: number; message: string }>('/api/servers/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getVersions: () =>
    request<{ versions: ServerVersion[] }>('/api/servers/versions'),
  getTemplates: () =>
    request<{ templates: ServerTemplate[] }>('/api/servers/templates'),
};

// Search API
export const searchApi = {
  search: (params: { q: string; type?: string; page?: number; limit?: number; category?: string; sort?: string }) => {
    const qs = new URLSearchParams();
    qs.set('q', params.q);
    if (params.type) qs.set('type', params.type);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.category) qs.set('category', params.category);
    if (params.sort) qs.set('sort', params.sort);
    return request<SearchResultResponse>(`/api/search?${qs.toString()}`);
  },
  getHistory: () => request<SearchHistoryEntry[]>('/api/search/history'),
  clearHistory: () => request<{ message: string }>('/api/search/history', { method: 'DELETE' }),
  getPopular: () => request<string[]>('/api/search/popular'),
};

// Generic API object for simple requests (backward compatibility)
export const api = {
  get: <T = unknown>(path: string) => request<T>(path),
  post: <T = unknown>(path: string, body?: unknown) => {
    clearCache();
    return request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },
  put: <T = unknown>(path: string, body?: unknown) => {
    clearCache();
    return request<T>(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  },
  delete: <T = unknown>(path: string) => {
    clearCache();
    return request<T>(path, { method: 'DELETE' });
  },
};

// LanLink Quick Code APIs
export const lanlinkApi = {
  getQuickCodeStatus: () => request<QuickCodeStatus>('/api/lanlink/quick-code/status'),
  generateQuickCode: () => {
    clearCache();
    return request<QuickCodeGenerateResponse>('/api/lanlink/quick-code/generate', {
      method: 'POST',
    });
  },
  resetQuickCode: () => {
    clearCache();
    return request<QuickCodeResetResponse>('/api/lanlink/quick-code/reset', {
      method: 'POST',
    });
  },
};

// 好友管理 API（论坛内部）
export const friendsApi = {
  /** 搜索非好友用户 */
  search: (q: string, limit = 10) =>
    request<{ data: Array<{ id: number; username: string; avatar_url: string }> }>(
      `/api/friends/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),

  /** 获取好友列表 */
  getList: (page = 1, limit = 50) =>
    request<{ friends: Array<{ id: number; username: string; avatar_url: string; friendship_since: string }>; total: number }>(
      `/api/friends?page=${page}&limit=${limit}`
    ),

  /** 获取待处理好友请求 */
  getRequests: (page = 1, limit = 20) =>
    request<{ requests: Array<{ id: number; requester: { id: number; username: string; avatar_url: string }; created_at: string }>; total: number }>(
      `/api/friends/requests?page=${page}&limit=${limit}`
    ),

  /** 发送好友请求 */
  sendRequest: (userId: number) =>
    request<{ message: string }>(`/api/friends/request/${userId}`, { method: 'POST' }),

  /** 接受好友请求 */
  acceptRequest: (userId: number) =>
    request<{ message: string }>(`/api/friends/accept/${userId}`, { method: 'POST' }),

  /** 拒绝好友请求 */
  rejectRequest: (userId: number) =>
    request<{ message: string }>(`/api/friends/reject/${userId}`, { method: 'POST' }),

  /** 取消好友请求 */
  cancelRequest: (userId: number) =>
    request<{ message: string }>(`/api/friends/cancel/${userId}`, { method: 'POST' }),

  /** 删除好友 */
  removeFriend: (userId: number) =>
    request<{ message: string }>(`/api/friends/${userId}`, { method: 'DELETE' }),

  /** 检查好友状态 */
  checkStatus: (userId: number) =>
    request<{ status: 'none' | 'incoming' | 'outgoing' | 'friends' }>(
      `/api/friends/check/${userId}`
    ),
};

// 用户在线状态 API
export type PresenceStatus = 'online' | 'hosting' | 'playing' | 'offline';

export interface PresenceData {
  status: PresenceStatus;
  room_code?: string;
  room_name?: string;
  node_name?: string;
  updated_at: number;
}

export const presenceApi = {
  /** 批量查询用户在线状态 */
  getPresences: (userIds: number[]) =>
    request<Record<string, PresenceData>>(
      `/api/presence?user_ids=${userIds.join(',')}`
    ),
};

// 资源评论 API
export const resourceCommentApi = {
  /** 获取资源的评论列表 */
  getByResource: (resourceId: number, params?: { page?: number; limit?: number }) =>
    request<ResourceCommentListResponse>(
      `/api/resources/${resourceId}/comments?page=${params?.page || 1}&limit=${params?.limit || 20}`
    ),

  /** 创建评论 */
  create: (resourceId: number, input: { content: string; parent_comment_id?: number }) => {
    clearCache();
    return request<ResourceComment>(`/api/resources/${resourceId}/comments`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** 更新评论 */
  update: (id: number, content: string) => {
    clearCache();
    return request<ResourceComment>(`/api/resource-comments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  },

  /** 删除评论 */
  delete: (id: number) => {
    clearCache();
    return request<{ success: boolean }>(`/api/resource-comments/${id}`, {
      method: 'DELETE',
    });
  },

  /** 点赞评论 */
  like: (id: number) => {
    clearCache();
    return request<{ success: boolean }>(`/api/resource-comments/${id}/like`, {
      method: 'POST',
    });
  },

  /** 取消点赞 */
  unlike: (id: number) => {
    clearCache();
    return request<{ success: boolean }>(`/api/resource-comments/${id}/like`, {
      method: 'DELETE',
    });
  },
};


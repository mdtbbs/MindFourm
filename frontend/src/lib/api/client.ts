import type { User, Post, PostListResponse, CreatePostInput, Reply, ReplyListResponse, CreateReplyInput, Category, Tag, AdminLog, AdminStats, AdminBan, AdminBanListResponse, CreateBanInput, ModerationItem } from '@/types';

const API_BASE = process.env.API_URL || 'http://localhost:4000';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Version': '1',
        ...options.headers,
      },
      credentials: 'include',
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Network error');
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // Response body is not JSON, use default message
    }
    throw new Error(message);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error('Invalid JSON response');
  }

  // Handle wrapped responses { success: true, data: ... }
  // But don't unwrap if data itself looks like a paginated response (has pagination or total)
  if (typeof data === 'object' && data !== null && 'success' in data && 'data' in data) {
    const inner = (data as { data: unknown }).data;
    if (typeof inner === 'object' && inner !== null && 'pagination' in inner) {
      // Paginated response - return the whole inner data object
      return inner as T;
    }
    return (data as { data: T }).data;
  }

  return data as T;
}

// Auth APIs
export const authApi = {
  check: () => request<{ authenticated: boolean; user?: User }>('/api/auth/check'),
  verifySession: (session_token: string) =>
    request<void>('/api/auth/verify-session', {
      method: 'POST',
      body: JSON.stringify({ session_token }),
    }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
};

// Post APIs
export const postApi = {
  getList: (params?: { page?: number; limit?: number; category_id?: number; user_id?: number }) =>
    request<PostListResponse>(`/api/posts${buildQueryString({
      page: params?.page,
      limit: params?.limit,
      category_id: params?.category_id,
      user_id: params?.user_id,
    })}`),
  getById: (id: number) => request<Post>(`/api/posts/${id}`),
  create: (input: CreatePostInput) =>
    request<Post>('/api/posts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: number, input: Partial<CreatePostInput>) =>
    request<Post>(`/api/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  delete: (id: number) =>
    request<void>(`/api/posts/${id}`, { method: 'DELETE' }),
};

// Reply APIs
export const replyApi = {
  getByPost: (postId: number, params?: { page?: number; limit?: number }) =>
    request<ReplyListResponse>(`/api/posts/${postId}/replies${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
  create: (postId: number, input: CreateReplyInput) =>
    request<Reply>(`/api/posts/${postId}/replies`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: number, content: string) =>
    request<Reply>(`/api/replies/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  delete: (id: number) =>
    request<void>(`/api/replies/${id}`, { method: 'DELETE' }),
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
  createCategory: (data: { name: string; slug: string; sort_order?: number }) =>
    request<Category>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCategory: (id: number, data: { name: string; slug: string; sort_order?: number }) =>
    request<Category>(`/api/admin/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: number) =>
    request<void>(`/api/admin/categories/${id}`, { method: 'DELETE' }),
  updateUserRole: (id: number, role: 'user' | 'moderator' | 'admin') =>
    request<User>(`/api/admin/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  pinPost: (id: number, isPinned: boolean) =>
    request<Post>(`/api/admin/posts/${id}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ is_pinned: isPinned }),
    }),
  movePost: (id: number, category_id: number) =>
    request<Post>(`/api/admin/posts/${id}/move`, {
      method: 'PUT',
      body: JSON.stringify({ category_id }),
    }),
  getLogs: (params?: { page?: number; limit?: number }) =>
    request<{ data: AdminLog[]; pagination: PostListResponse['pagination'] }>(
      `/api/admin/logs${buildQueryString({ page: params?.page, limit: params?.limit })}`
    ),
  getUsers: (params?: { page?: number; limit?: number }) =>
    request<{ data: User[]; pagination: PostListResponse['pagination'] }>(
      `/api/admin/users${buildQueryString({ page: params?.page, limit: params?.limit })}`
    ),
  getStats: () =>
    request<AdminStats>('/api/admin/stats'),
  getSettings: (category?: string) =>
    request<Record<string, string>>(`/api/admin/settings${category ? `/${category}` : ''}`),
  updateSettings: (category: string, data: Record<string, string>) =>
    request<Record<string, string>>(`/api/admin/settings/${category}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getTags: () =>
    request<Tag[]>('/api/admin/tags'),
  createTag: (data: { name: string; slug?: string }) =>
    request<Tag>('/api/admin/tags', { method: 'POST', body: JSON.stringify(data) }),
  updateTag: (id: number, data: { name?: string; slug?: string }) =>
    request<Tag>(`/api/admin/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTag: (id: number) =>
    request<void>(`/api/admin/tags/${id}`, { method: 'DELETE' }),
  mergeTags: (from_tag_id: number, to_tag_id: number) =>
    request<{ message: string }>('/api/admin/tags/merge', {
      method: 'POST', body: JSON.stringify({ from_tag_id, to_tag_id }),
    }),
  getModeration: (params?: { page?: number; limit?: number; type?: string }) =>
    request<{ data: ModerationItem[]; pagination: PostListResponse['pagination'] }>(
      `/api/admin/moderation${buildQueryString({ page: params?.page, limit: params?.limit, type: params?.type })}`
    ),
  approvePost: (id: number) =>
    request<{ message: string }>(`/api/admin/moderation/${id}/approve`, { method: 'PUT' }),
  rejectPost: (id: number) =>
    request<{ message: string }>(`/api/admin/moderation/${id}/reject`, { method: 'PUT' }),
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
  bulkDeletePosts: (post_ids: number[]) =>
    request<{ message: string }>('/api/admin/posts', { method: 'DELETE', body: JSON.stringify({ post_ids }) }),
  bulkPinPosts: (post_ids: number[], is_pinned: boolean) =>
    request<{ message: string }>('/api/admin/posts/pin', { method: 'PUT', body: JSON.stringify({ post_ids, is_pinned }) }),
  bulkMovePosts: (post_ids: number[], category_id: number) =>
    request<{ message: string }>('/api/admin/posts/move', { method: 'PUT', body: JSON.stringify({ post_ids, category_id }) }),
};

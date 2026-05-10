import { ApiResponse } from '@/types';

const API_BASE = '';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || `Request failed: ${res.status}`);
  }

  // Handle wrapped responses { success: true, data: ... }
  if ('success' in data && 'data' in data) {
    return data.data as T;
  }

  return data as T;
}

// Auth APIs
export const authApi = {
  check: () => request<ApiResponse<{ authenticated: boolean; user?: import('@/types').User }>>('/api/auth/check'),
  verifySession: (session_token: string) =>
    request<ApiResponse>('/api/auth/verify-session', {
      method: 'POST',
      body: JSON.stringify({ session_token }),
    }),
  logout: () => request<ApiResponse>('/api/auth/logout', { method: 'POST' }),
};

// Post APIs
export const postApi = {
  getList: (params?: { page?: number; limit?: number; category_id?: number; user_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.category_id) qs.set('category_id', String(params.category_id));
    if (params?.user_id) qs.set('user_id', String(params.user_id));
    return request<import('@/types').PostListResponse>(`/api/posts?${qs}`);
  },
  getById: (id: number) => request<import('@/types').Post>(`/api/posts/${id}`),
  create: (input: import('@/types').CreatePostInput) =>
    request<import('@/types').Post>('/api/posts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: number, input: Partial<import('@/types').CreatePostInput>) =>
    request<import('@/types').Post>(`/api/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  delete: (id: number) =>
    request<ApiResponse>(`/api/posts/${id}`, { method: 'DELETE' }),
};

// Reply APIs
export const replyApi = {
  getByPost: (postId: number, params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<import('@/types').ReplyListResponse>(`/api/posts/${postId}/replies?${qs}`);
  },
  create: (postId: number, input: import('@/types').CreateReplyInput) =>
    request<import('@/types').Reply>(`/api/posts/${postId}/replies`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: number, content: string) =>
    request<import('@/types').Reply>(`/api/replies/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  delete: (id: number) =>
    request<ApiResponse>(`/api/replies/${id}`, { method: 'DELETE' }),
};

// Category APIs
export const categoryApi = {
  getList: () => request<import('@/types').Category[]>('/api/categories'),
  getById: (id: number) => request<import('@/types').Category>(`/api/categories/${id}`),
};

// Tag APIs
export const tagApi = {
  getList: () => request<import('@/types').Tag[]>('/api/tags'),
  getPostsByTag: (slug: string, page?: number) => {
    const qs = new URLSearchParams();
    if (page) qs.set('page', String(page));
    return request<import('@/types').PostListResponse>(`/api/tags/${slug}/posts?${qs}`);
  },
};

// Admin APIs
export const adminApi = {
  createCategory: (data: { name: string; slug: string; sort_order?: number }) =>
    request<import('@/types').Category>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCategory: (id: number, data: { name: string; slug: string; sort_order?: number }) =>
    request<import('@/types').Category>(`/api/admin/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: number) =>
    request<ApiResponse>(`/api/admin/categories/${id}`, { method: 'DELETE' }),
  updateUserRole: (id: number, role: 'user' | 'moderator' | 'admin') =>
    request<import('@/types').User>(`/api/admin/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  pinPost: (id: number, isPinned: boolean) =>
    request<import('@/types').Post>(`/api/admin/posts/${id}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ is_pinned: isPinned }),
    }),
  movePost: (id: number, category_id: number) =>
    request<import('@/types').Post>(`/api/admin/posts/${id}/move`, {
      method: 'PUT',
      body: JSON.stringify({ category_id }),
    }),
  getLogs: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<{ data: import('@/types').AdminLog[]; pagination: import('@/types').PostListResponse['pagination'] }>(`/api/admin/logs?${qs}`);
  },
  getUsers: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<{ data: import('@/types').User[]; pagination: import('@/types').PostListResponse['pagination'] }>(`/api/admin/users?${qs}`);
  },
};

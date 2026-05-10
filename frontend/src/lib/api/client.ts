import type { User, Post, PostListResponse, CreatePostInput, Reply, ReplyListResponse, CreateReplyInput, Category, Tag, AdminLog } from '@/types';

const API_BASE = '';

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
  if (typeof data === 'object' && data !== null && 'success' in data && 'data' in data) {
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
};

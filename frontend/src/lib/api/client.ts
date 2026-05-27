import type { User, Post, PostListResponse, CreatePostInput, Reply, ReplyListResponse, CreateReplyInput, Category, Tag, AdminLog, AdminStats, AdminBan, AdminBanListResponse, CreateBanInput, ModerationItem, UserProfile, Bookmark, BookmarkListResponse, Notification, NotificationListResponse, Attachment, Message, Conversation, Resource, ResourceCategory, ResourceVersion, Server, ServerVersion, ServerTemplate } from '@/types';

const API_BASE = process.env.API_URL || 'http://localhost:4000';

// Simple in-memory cache for GET requests (client-side only)
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

// Get CSRF token from cookie (client-side only)
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null; // Server-side
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

function getCacheKey(path: string, options: RequestInit): string | null {
  if (options.method && options.method !== 'GET') return null;
  return `${options.method || 'GET'}:${path}`;
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

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = options.method || 'GET';
  const cacheKey = getCacheKey(path, options);

  // Return cached data for GET requests
  if (cacheKey) {
    const cached = getCached<T>(cacheKey);
    if (cached !== null) return cached;
  }

  const isFormData = options.body instanceof FormData;
  // Local API Routes don't need API_BASE prefix
  const isLocalRoute = path.startsWith('/api/auth/');

  // Add CSRF token for POST/PUT/DELETE requests (except local auth routes)
  const shouldAddCsrf = !isLocalRoute && ['POST', 'PUT', 'DELETE'].includes(method);
  const csrfToken = shouldAddCsrf ? getCsrfToken() : null;

  // Build headers
  const headers: Record<string, string> = {
    ...options.headers as Record<string, string>,
    'X-API-Version': '1',
  };

  // Add Content-Type for JSON requests (not FormData)
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  // Add CSRF token if available
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const url = isLocalRoute ? path : `${API_BASE}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
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
    const result = d.data as T;
    if (cacheKey) setCache(cacheKey, result);
    return result;
  }

  const result = data as T;
  if (cacheKey) setCache(cacheKey, result);
  return result;
}

// Public settings (no auth)
export const settingsApi = {
  get: () => request<Record<string, string>>('/api/settings'),
};

// Auth APIs (via Next.js API Routes)
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
  getList: (params?: { page?: number; limit?: number; category_id?: number; user_id?: number; search?: string }) =>
    request<PostListResponse>(`/api/posts${buildQueryString({
      page: params?.page,
      limit: params?.limit,
      category_id: params?.category_id,
      user_id: params?.user_id,
      search: params?.search,
    })}`),
  getListCursor: (params?: { cursor?: string; limit?: number; category_id?: number; search?: string }) =>
    request<{ data: Post[]; next_cursor: string | null; has_more: boolean }>(`/api/v1/posts/cursor${buildQueryString({
      cursor: params?.cursor,
      limit: params?.limit,
      category_id: params?.category_id,
      search: params?.search,
    })}`),
  getById: (id: number) => request<Post>(`/api/posts/${id}`),
  create: (input: CreatePostInput) => {
    invalidateCache('/api/posts');
    return request<Post>('/api/posts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update: (id: number, input: Partial<CreatePostInput>) => {
    invalidateCache('/api/posts');
    return request<Post>(`/api/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },
  delete: (id: number) => {
    invalidateCache('/api/posts');
    return request<void>(`/api/posts/${id}`, { method: 'DELETE' });
  },
};

// Reply APIs
export const replyApi = {
  getByPost: (postId: number, params?: { page?: number; limit?: number }) =>
    request<ReplyListResponse>(`/api/posts/${postId}/replies${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
  create: (postId: number, input: CreateReplyInput) => {
    invalidateCache('/api/posts'); // Invalidate post cache to update reply count
    return request<Reply>(`/api/posts/${postId}/replies`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  update: (id: number, content: string) => {
    invalidateCache('/api/posts'); // Invalidate post cache
    return request<Reply>(`/api/replies/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  },
  delete: (id: number) => {
    invalidateCache('/api/posts'); // Invalidate post cache
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
  createCategory: (data: { name: string; slug: string; sort_order?: number }) => {
    invalidateCache('/api/categories');
    return request<Category>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateCategory: (id: number, data: { name: string; slug: string; sort_order?: number }) => {
    invalidateCache('/api/categories');
    return request<Category>(`/api/admin/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  deleteCategory: (id: number) => {
    invalidateCache('/api/categories');
    invalidateCache('/api/posts');
    return request<void>(`/api/admin/categories/${id}`, { method: 'DELETE' });
  },
  updateUserRole: (id: number, role: 'user' | 'moderator' | 'admin') =>
    request<User>(`/api/admin/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  pinPost: (id: number, isPinned: boolean) => {
    invalidateCache('/api/posts');
    return request<Post>(`/api/admin/posts/${id}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ is_pinned: isPinned }),
    });
  },
  movePost: (id: number, category_id: number) => {
    invalidateCache('/api/posts');
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
  getSettings: (category?: string) =>
    request<Record<string, string>>(`/api/admin/settings${category ? `/${category}` : ''}`),
  updateSettings: (category: string, data: Record<string, string>) =>
    request<Record<string, string>>(`/api/admin/settings/${category}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getTags: () =>
    request<Tag[]>('/api/admin/tags'),
  createTag: (data: { name: string; slug?: string }) => {
    invalidateCache('/api/tags');
    return request<Tag>('/api/admin/tags', { method: 'POST', body: JSON.stringify(data) });
  },
  updateTag: (id: number, data: { name?: string; slug?: string }) => {
    invalidateCache('/api/tags');
    return request<Tag>(`/api/admin/tags/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  },
  deleteTag: (id: number) => {
    invalidateCache('/api/tags');
    invalidateCache('/api/posts');
    return request<void>(`/api/admin/tags/${id}`, { method: 'DELETE' });
  },
  mergeTags: (from_tag_id: number, to_tag_id: number) => {
    invalidateCache('/api/tags');
    invalidateCache('/api/posts');
    return request<{ message: string }>('/api/admin/tags/merge', {
      method: 'POST', body: JSON.stringify({ from_tag_id, to_tag_id }),
    });
  },
  getModeration: (params?: { page?: number; limit?: number; type?: string }) =>
    request<{ data: ModerationItem[]; pagination: PostListResponse['pagination'] }>(
      `/api/admin/moderation${buildQueryString({ page: params?.page, limit: params?.limit, type: params?.type })}`
    ),
  approvePost: (id: number) => {
    invalidateCache('/api/posts');
    invalidateCache('/api/admin/moderation');
    return request<{ message: string }>(`/api/admin/moderation/${id}/approve`, { method: 'PUT' });
  },
  rejectPost: (id: number) => {
    invalidateCache('/api/admin/moderation');
    return request<{ message: string }>(`/api/admin/moderation/${id}/reject`, { method: 'PUT' });
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
  bulkDeletePosts: (post_ids: number[]) => {
    invalidateCache('/api/posts');
    return request<{ message: string }>('/api/admin/posts', { method: 'DELETE', body: JSON.stringify({ post_ids }) });
  },
  bulkPinPosts: (post_ids: number[], is_pinned: boolean) => {
    invalidateCache('/api/posts');
    return request<{ message: string }>('/api/admin/posts/pin', { method: 'PUT', body: JSON.stringify({ post_ids, is_pinned }) });
  },
  bulkMovePosts: (post_ids: number[], category_id: number) => {
    invalidateCache('/api/posts');
    return request<{ message: string }>('/api/admin/posts/move', { method: 'PUT', body: JSON.stringify({ post_ids, category_id }) });
  },
};

// User APIs
export const userApi = {
  getById: (id: number) => request<UserProfile>(`/api/v1/users/${id}`),
  getMyProfile: () => request<UserProfile>('/api/v1/users/me'),
  updateProfile: (data: { username?: string; bio?: string }) =>
    request<UserProfile>('/api/v1/users/me/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  uploadAvatar: (formData: FormData) =>
    request<{ avatar_url: string }>('/api/v1/users/me/avatar', {
      method: 'POST',
      body: formData,
    }),
  removeAvatar: () =>
    request<void>('/api/v1/users/me/avatar', { method: 'DELETE' }),
  getMyReplies: (params?: { page?: number; limit?: number }) =>
    request<ReplyListResponse>(`/api/v1/users/me/replies${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
};

// Bookmark APIs
export const bookmarkApi = {
  list: (params?: { page?: number; limit?: number }) =>
    request<BookmarkListResponse>(`/api/v1/bookmarks${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
  check: (postId: number) =>
    request<{ bookmarked: boolean }>(`/api/v1/bookmarks/check/${postId}`),
  add: (postId: number) =>
    request<Bookmark>(`/api/v1/bookmarks/${postId}`, { method: 'POST' }),
  remove: (postId: number) =>
    request<void>(`/api/v1/bookmarks/${postId}`, { method: 'DELETE' }),
};

// Notification APIs
export const notificationApi = {
  list: (params?: { page?: number; limit?: number }) =>
    request<NotificationListResponse>(`/api/v1/notifications${buildQueryString({
      page: params?.page,
      limit: params?.limit,
    })}`),
  listCursor: (params?: { cursor?: string; limit?: number }) =>
    request<{ data: Notification[]; next_cursor: string | null; has_more: boolean }>(`/api/v1/notifications/cursor${buildQueryString({
      cursor: params?.cursor,
      limit: params?.limit,
    })}`),
  unreadCount: () =>
    request<{ count: number }>('/api/v1/notifications/unread-count'),
  markAsRead: (id: number) =>
    request<void>(`/api/v1/notifications/${id}/read`, { method: 'PUT' }),
  markAllAsRead: () =>
    request<void>('/api/v1/notifications/read-all', { method: 'PUT' }),
};

// Attachment APIs
export const attachmentApi = {
  upload: (formData: FormData) =>
    request<Attachment | Attachment[]>('/api/v1/attachments/upload', {
      method: 'POST',
      body: formData,
    }),
  getByPost: (postId: number) =>
    request<Attachment[]>(`/api/v1/attachments/post/${postId}`),
  download: (id: number) => `${API_BASE}/api/v1/attachments/${id}/download`,
};

// Message APIs
export const messageApi = {
  send: (recipient_id: number, content: string) =>
    request<Message>('/api/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ recipient_id, content }),
    }),
  getConversations: (params?: { cursor?: string; limit?: number }) =>
    request<{ data: Conversation[]; next_cursor: string | null; has_more: boolean }>(
      `/api/v1/messages${buildQueryString({ cursor: params?.cursor, limit: params?.limit })}`
    ),
  getConversation: (userId: number, params?: { cursor?: string; limit?: number }) =>
    request<{ data: Message[]; next_cursor: string | null; has_more: boolean }>(
      `/api/v1/messages/${userId}${buildQueryString({ cursor: params?.cursor, limit: params?.limit })}`
    ),
  unreadCount: () =>
    request<{ count: number }>('/api/v1/messages/unread-count'),
  delete: (id: number) =>
    request<void>(`/api/v1/messages/${id}`, { method: 'DELETE' }),
};

// Resource APIs
export const resourceApi = {
  list: (params?: { cursor?: string; limit?: number; category_id?: number; search?: string; sort?: string }) =>
    request<{ data: Resource[]; next_cursor: string | null; has_more: boolean }>(
      `/api/v1/resources${buildQueryString({ cursor: params?.cursor, limit: params?.limit, category_id: params?.category_id, search: params?.search, sort: params?.sort })}`
    ),
  getById: (id: number) =>
    request<Resource>(`/api/v1/resources/${id}`),
  download: (id: number) => `${API_BASE}/api/v1/resources/${id}/download`,
  upload: (formData: FormData) =>
    request<Resource>('/api/v1/resources', {
      method: 'POST',
      body: formData,
    }),
  update: (id: number, data: Partial<Resource>) => {
    invalidateCache('/api/v1/resources');
    return request<Resource>(`/api/v1/resources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  delete: (id: number) => {
    invalidateCache('/api/v1/resources');
    return request<void>(`/api/v1/resources/${id}`, { method: 'DELETE' });
  },
  getCategories: () =>
    request<ResourceCategory[]>('/api/v1/resources/categories'),
  getVersions: (id: number) =>
    request<{ versions: ResourceVersion[] }>(`/api/v1/resources/${id}/versions`),
  addVersion: (id: number, formData: FormData) => {
    invalidateCache('/api/v1/resources');
    return request<ResourceVersion>(`/api/v1/resources/${id}/versions`, {
      method: 'POST',
      body: formData,
    });
  },
};

// Resource Category Admin APIs
export const resourceCategoryApi = {
  list: () => request<ResourceCategory[]>('/api/v1/resources/categories'),
  create: (data: Omit<ResourceCategory, 'id' | 'created_at'>) => {
    invalidateCache('/api/v1/resources/categories');
    return request<ResourceCategory>('/api/v1/resources/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  update: (id: number, data: Partial<ResourceCategory>) => {
    invalidateCache('/api/v1/resources/categories');
    invalidateCache('/api/v1/resources');
    return request<ResourceCategory>(`/api/v1/resources/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  delete: (id: number) => {
    invalidateCache('/api/v1/resources/categories');
    invalidateCache('/api/v1/resources');
    return request<void>(`/api/v1/resources/categories/${id}`, { method: 'DELETE' });
  },
};

// Resource Admin APIs
export const resourceAdminApi = {
  list: (params?: { cursor?: string; limit?: number; status?: string; category_id?: number; search?: string; sort?: string }) =>
    request<{ data: Resource[]; next_cursor: string | null; has_more: boolean }>(
      `/api/v1/resources/admin${buildQueryString({ cursor: params?.cursor, limit: params?.limit, status: params?.status, category_id: params?.category_id, search: params?.search, sort: params?.sort })}`
    ),
  updateStatus: (id: number, status: string) => {
    invalidateCache('/api/v1/resources');
    invalidateCache('/api/v1/resources/admin');
    return request<Resource>(`/api/v1/resources/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },
  delete: (id: number) => {
    invalidateCache('/api/v1/resources');
    invalidateCache('/api/v1/resources/admin');
    return request<void>(`/api/v1/resources/${id}/admin`, { method: 'DELETE' });
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

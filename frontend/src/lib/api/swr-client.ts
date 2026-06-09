import useSWR, { SWRConfiguration, mutate, Key } from 'swr';
import type { User, Post, PostListResponse, Reply, ReplyListResponse, Category, Tag, Notification, NotificationListResponse, UserProfile, Bookmark, BookmarkListResponse, Attachment, Message, Conversation, Resource, ResourceCategory, ResourceVersion, Server, ServerVersion, ServerTemplate } from '@/types';

const API_BASE = '';

// Default fetcher for SWR
const fetcher = async <T>(url: string): Promise<T> => {
  const isLocalRoute = url.startsWith('/api/auth/');
  const fullUrl = isLocalRoute ? url : `${API_BASE}${url}`;

  const res = await fetch(fullUrl, {
    headers: { 'Content-Type': 'application/json', 'X-API-Version': '1' },
    credentials: 'include',
  });

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {}
    throw new Error(message);
  }

  const data = await res.json();

  // Handle wrapped responses
  if (typeof data === 'object' && data !== null && 'success' in data && 'data' in data) {
    const d = data as { data: unknown; pagination?: unknown };
    if (d.pagination !== undefined) {
      return { data: d.data, pagination: d.pagination } as T;
    }
    const inner = d.data;
    if (typeof inner === 'object' && inner !== null && 'pagination' in inner) {
      return inner as T;
    }
    return d.data as T;
  }

  return data as T;
};

// Default SWR config
const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 5000, // 5 seconds dedup
  errorRetryCount: 2,
};

// Helper to create useSWR hook with default config
function useApi<T>(key: Key, config?: SWRConfiguration) {
  return useSWR<T>(key, fetcher, { ...defaultConfig, ...config });
}

// Invalidate cache by path prefix
export function invalidateCache(pathPrefix: string) {
  mutate(
    (key: unknown) => typeof key === 'string' && key.includes(pathPrefix),
    undefined,
    { revalidate: true }
  );
}

// Invalidate all cache
export function invalidateAll() {
  mutate(() => true, undefined, { revalidate: true });
}

// === Settings ===
export function useSettings() {
  return useApi<Record<string, string>>('/api/settings');
}

// === Auth ===
export function useAuthCheck() {
  return useApi<{ authenticated: boolean; user?: User }>('/api/auth/check');
}

// === Posts ===
export function usePosts(params?: { page?: number; limit?: number; category_id?: number; user_id?: number; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.category_id) qs.set('category_id', String(params.category_id));
  if (params?.user_id) qs.set('user_id', String(params.user_id));
  if (params?.search) qs.set('search', params.search);
  const query = qs.toString();
  return useApi<PostListResponse>(`/api/posts${query ? `?${query}` : ''}`);
}

export function usePostCursor(params?: { cursor?: string; limit?: number; category_id?: number; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.category_id) qs.set('category_id', String(params.category_id));
  if (params?.search) qs.set('search', params.search);
  const query = qs.toString();
  return useApi<{ data: Post[]; next_cursor: string | null; has_more: boolean }>(`/api/v1/posts/cursor${query ? `?${query}` : ''}`);
}

export function usePost(id: number | null | undefined) {
  return useApi<Post>(id ? `/api/posts/${id}` : null);
}

// === Replies ===
export function useReplies(postId: number, params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return useApi<ReplyListResponse>(`/api/posts/${postId}/replies${query ? `?${query}` : ''}`);
}

// === Categories ===
export function useCategories() {
  return useApi<Category[]>('/api/categories');
}

export function useCategory(id: number | null | undefined) {
  return useApi<Category>(id ? `/api/categories/${id}` : null);
}

// === Tags ===
export function useTags() {
  return useApi<Tag[]>('/api/tags');
}

export function usePostsByTag(slug: string | null | undefined, page?: number) {
  const qs = new URLSearchParams();
  if (page) qs.set('page', String(page));
  const query = qs.toString();
  return useApi<PostListResponse>(slug ? `/api/tags/${slug}/posts${query ? `?${query}` : ''}` : null);
}

// === Users ===
export function useUser(id: number | null | undefined) {
  return useApi<UserProfile>(id ? `/api/v1/users/${id}` : null);
}

export function useMyProfile() {
  return useApi<UserProfile>('/api/v1/users/me');
}

export function useMyReplies(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return useApi<ReplyListResponse>(`/api/v1/users/me/replies${query ? `?${query}` : ''}`);
}

// === Bookmarks ===
export function useBookmarks(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return useApi<BookmarkListResponse>(`/api/v1/bookmarks${query ? `?${query}` : ''}`);
}

export function useBookmarkCheck(postId: number | null | undefined) {
  return useApi<{ bookmarked: boolean }>(postId ? `/api/v1/bookmarks/check/${postId}` : null);
}

// === Notifications ===
export function useNotifications(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return useApi<NotificationListResponse>(`/api/v1/notifications${query ? `?${query}` : ''}`);
}

export function useNotificationsCursor(params?: { cursor?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return useApi<{ data: Notification[]; next_cursor: string | null; has_more: boolean }>(`/api/v1/notifications/cursor${query ? `?${query}` : ''}`);
}

export function useUnreadCount() {
  return useApi<{ count: number }>('/api/v1/notifications/unread-count');
}

// === Messages ===
export function useConversations(params?: { cursor?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return useApi<{ data: Conversation[]; next_cursor: string | null; has_more: boolean }>(`/api/v1/messages${query ? `?${query}` : ''}`);
}

export function useConversation(userId: number | null | undefined, params?: { cursor?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return useApi<{ data: Message[]; next_cursor: string | null; has_more: boolean }>(userId ? `/api/v1/messages/${userId}${query ? `?${query}` : ''}` : null);
}

export function useMessageUnreadCount() {
  return useApi<{ count: number }>('/api/v1/messages/unread-count');
}

// === Attachments ===
export function useAttachments(postId: number | null | undefined) {
  return useApi<Attachment[]>(postId ? `/api/v1/attachments/post/${postId}` : null);
}

// === Resources ===
export function useResources(params?: { cursor?: string; limit?: number; category_id?: number; search?: string; sort?: string }) {
  const qs = new URLSearchParams();
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.category_id) qs.set('category_id', String(params.category_id));
  if (params?.search) qs.set('search', params.search);
  if (params?.sort) qs.set('sort', params.sort);
  const query = qs.toString();
  return useApi<{ data: Resource[]; next_cursor: string | null; has_more: boolean }>(`/api/v1/resources${query ? `?${query}` : ''}`);
}

export function useResource(id: number | null | undefined) {
  return useApi<Resource>(id ? `/api/v1/resources/${id}` : null);
}

export function useResourceCategories() {
  return useApi<ResourceCategory[]>('/api/v1/resources/categories');
}

export function useResourceVersions(id: number | null | undefined) {
  return useApi<{ versions: ResourceVersion[] }>(id ? `/api/v1/resources/${id}/versions` : null);
}

// === Servers ===
export function usePublicServers() {
  return useApi<{ servers: Server[] }>('/api/servers/public');
}

export function useServerBasic(id: number | null | undefined) {
  return useApi<{ server: Server }>(id ? `/api/servers/${id}/basic` : null);
}

export function useUserServers() {
  return useApi<{ servers: Server[] }>('/api/servers/my');
}

export function useServerVersions() {
  return useApi<{ versions: ServerVersion[] }>('/api/servers/versions');
}

export function useServerTemplates() {
  return useApi<{ templates: ServerTemplate[] }>('/api/servers/templates');
}

export { fetcher };
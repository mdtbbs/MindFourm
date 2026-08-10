// User types
export type UserRole = 'guest' | 'user' | 'moderator' | 'admin';

export interface User {
  id: number;
  mindauthId: number;
  username: string | null;
  email: string | null;
  role: UserRole;
  avatar_url?: string | null;
  bio?: string | null;
  phone_verified?: boolean;
  phone_verified_at?: string | null;
  createdAt: string;
}

export interface AuthCheckResponse {
  success: boolean;
  data?: {
    authenticated: boolean;
    user?: User;
  };
  message?: string;
}

// Category types
export interface Category {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  post_count?: number;
}

// Tag types
export interface Tag {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  post_count?: number;
}

// Post types
export interface PostSummary {
  id: number;
  user_id: number;
  category_id: number | null;
  server_id?: number | null;
  post_type?: string;
  slug?: string | null;
  title: string;
  excerpt: string;
  status: 'draft' | 'published' | 'pending' | 'deleted';
  is_pinned: boolean;
  view_count: number;
  reply_count: number;
  like_count: number;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  category_slug: string | null;
  author_mindauth_id: number | null;
  author_role: UserRole | null;
  author_name?: string | null;
  author_avatar_url?: string | null;
  tags: Tag[];
}

export interface Post {
  id: number;
  user_id: number;
  category_id: number | null;
  server_id?: number | null;
  required_group_id?: number | null;
  post_type?: string;
  slug?: string | null;
  title: string;
  content: string;
  content_html: string | null;
  status: 'draft' | 'published' | 'pending' | 'deleted';
  reject_reason?: string | null;
  is_pinned: boolean;
  view_count: number;
  reply_count?: number;
  like_count: number;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  category_slug: string | null;
  author_mindauth_id: number | null;
  author_role: UserRole | null;
  author_name?: string | null;
  author_avatar_url?: string | null;
  tags: Tag[];
  current_user_role?: UserRole | null;
  /** Set by the post-detail endpoint: whether the requesting session authored this post. */
  is_owner?: boolean;
  /** Closed to new replies. Enforced by the API, not just reflected here. */
  is_locked?: boolean;
  /** The reply the author or staff accepted as the answer. */
  best_reply_id?: number | null;
  /** Last time the title or body changed; absent if never edited. */
  edited_at?: string | null;
  replies?: Reply[];
  replyPagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface PostListResponse {
  data: PostSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreatePostInput {
  title: string;
  content: string;
  category_id?: number;
  tags?: string[];
  status?: 'draft' | 'published';
}

// Reply types
export interface Reply {
  id: number;
  post_id: number;
  user_id: number;
  parent_reply_id: number | null;
  content: string;
  content_html: string | null;
  post_title?: string | null;
  status: 'active' | 'published' | 'pending' | 'deleted';
  like_count: number;
  created_at: string;
  updated_at: string;
  author_mindauth_id: number | null;
  author_role: UserRole | null;
  author_name?: string | null;
  author_avatar_url?: string | null;
}

export interface ReplyListResponse {
  data: Reply[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateReplyInput {
  content: string;
  parent_reply_id?: number;
}

// Admin types
export interface AdminLog {
  id: number;
  user_id: number | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface UpdateRoleInput {
  role: Exclude<UserRole, 'guest'>;
}

// API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// Form state
export interface FormState<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  submitted: boolean;
}

// Admin panel types
export interface AdminStats {
  total_posts: number;
  total_replies: number;
  total_users: number;
  active_24h: number;
  today_posts: number;
  today_replies: number;
  today_users: number;
  activity_7d: number[];
}

export interface AdminBan {
  id: number;
  ban_type: string;
  value: string;
  reason: string | null;
  created_by: number;
  created_at: string;
  is_active: boolean;
  creator_name: string | null;
}

export interface AdminBanListResponse {
  data: AdminBan[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateBanInput {
  ban_type: 'ip' | 'ip_range' | 'user';
  value: string;
  reason?: string;
}

export interface ModerationItem {
  id: number;
  item_type: 'post' | 'reply' | 'avatar';
  title?: string;
  content: string;
  author_username: string;
  created_at: string;
  post_id?: number;
  avatar_url?: string;
}

export interface SearchHistoryEntry {
  id: number;
  query: string;
  search_type: string;
  results_count: number;
  created_at: string;
}

export interface SearchResultResponse {
  data: PostSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  popular_searches?: string[];
  resources?: Resource[];
}

// Phase 2: User Profile
export interface UserProfile {
  id: number;
  mindauth_id: number;
  username: string | null;
  email: string | null;
  role: UserRole;
  avatar_url: string | null;
  pending_avatar_url?: string | null;
  avatar_status?: 'approved' | 'pending' | 'rejected';
  bio: string | null;
  created_at: string;
  post_count: number;
  reply_count: number;
  // Points & Level
  total_points?: number;
  level?: { id: number; name: string; slug: string; color: string | null; icon: string | null; progress?: number };
  // Follow stats
  follower_count?: number;
  following_count?: number;
  // Badges
  badges?: Array<{ id: number; name: string; slug: string; icon: string | null; level: string | null }>;
}

// Phase 2: Bookmarks
export interface Bookmark {
  id: number;
  created_at: string;
  post_id: number;
  title: string;
  status: 'draft' | 'published' | 'pending' | 'deleted';
  category_name: string | null;
  category_id: number | null;
  author_mindauth_id: number;
  author_role: UserRole;
}

export interface BookmarkListResponse {
  data: Bookmark[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Phase 2: Notifications
export interface Notification {
  id: number;
  user_id: number;
  type: 'reply' | 'mention' | 'message' | 'post_like' | 'reply_like' | 'system' | 'best_answer' | 'friend_request' | 'friend_accepted';
  actor_id: number | null;
  actor_name: string | null;
  actor_avatar: string | null;
  post_id: number | null;
  post_title: string | null;
  reply_id: number | null;
  content: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  data: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminNotification {
  id: number;
  user_id: number;
  event_key: string;
  category: string;
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  content: string | null;
  action_url: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface AdminNotificationListResponse {
  data: AdminNotification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Attachments
export interface Attachment {
  id: number;
  post_id: number | null;
  reply_id: number | null;
  user_id: number;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  download_count: number;
  created_at: string;
}

// Messages
export interface Message {
  id: number;
  sender_id: number;
  recipient_id: number;
  sender_name: string;
  sender_avatar: string | null;
  content: string;
  content_html: string;
  is_read: boolean;
  created_at: string;
}

export interface Conversation {
  user_id: number;
  username: string;
  avatar_url: string | null;
  unread_count: number;
  last_at: string;
  last_content: string | null;
}

// Resources
export interface Resource {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  resource_type: 'upload' | 'external';
  resource_kind?: string | null;
  integrity?: string | null;
  file_name: string | null;
  file_path: string | null;
  file_size: number;
  mime_type: string | null;
  external_url: string | null;
  version: string | null;
  content: string | null;
  content_html: string | null;
  category_id: number | null;
  category_name: string | null;
  category_icon: string | null;
  download_count: number;
  slug?: string | null;
  rating_count?: number;
  rating_sum?: number;
  rating_average?: number;
  is_public: boolean;
  status: string;
  reject_reason?: string | null;
  use_mfl: boolean;
  mfl_download_url: string | null;
  username: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  versions?: ResourceVersion[];
}

export interface ResourceCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  parent_id: number | null;
  children?: ResourceCategory[];
  created_at: string;
}

export interface ResourceVersion {
  id: number;
  resource_id: number;
  version: string;
  file_path: string | null;
  file_name: string | null;
  file_size: number;
  mime_type: string | null;
  content: string | null;
  content_html: string | null;
  created_at: string;
}

// Resource Comments
export interface ResourceComment {
  id: number;
  resource_id: number;
  user_id: number;
  parent_id: number | null;
  content: string;
  content_html: string | null;
  status: string;
  edited_at: string | null;
  upvote_count: number;
  downvote_count: number;
  report_count: number;
  created_at: string;
  updated_at: string;
  username?: string;
  avatar_url?: string | null;
}

export interface ResourceCommentListResponse {
  data: ResourceComment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Servers (EasyManager integration)
export interface Server {
  id: number;
  name: string;
  description: string | null;
  port: number;
  version: string;
  status: string;
  approval_status?: string;
  owner_id: number;
  players: number;
  playerList: { name: string; id: number; team: number }[];
  mapName: string;
  wave: number;
  created_at: string;
}

export interface ServerVersion {
  version: string;
  download_url: string;
  is_stable: boolean;
}

export interface ServerTemplate {
  id: number;
  name: string;
  version: string;
  is_public: boolean;
}

// Phase 3: Likes
export interface LikedPost {
  id: number;
  created_at: string;
  post_id: number;
  title: string;
  status: string;
  like_count: number;
  category_name: string | null;
  category_id: number | null;
  author_mindauth_id: number;
  author_role: UserRole;
  author_name: string | null;
}

// LanLink types
export * from './lanlink';

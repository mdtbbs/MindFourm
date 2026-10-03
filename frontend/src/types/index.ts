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
  email_verified?: boolean;
  preferred_locale?: string | null;
  phone_verified?: boolean;
  phone_verified_at?: string | null;
  createdAt: string;
  /** Coarse province label from the member's latest public content; no raw IP is exposed. */
  last_location_label?: string | null;
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
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  group_key?: 'community' | 'creation' | 'game' | 'meta' | null;
  parent_id?: number | null;
  show_in_sidebar?: boolean;
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
  source?: 'USER' | 'SYSTEM' | 'GITHUB_ISSUE' | 'GITHUB_PR' | 'RSS' | 'IMPORT' | 'API';
  slug?: string | null;
  title: string;
  excerpt: string;
  content_language?: string;
  status: 'draft' | 'published' | 'pending' | 'deleted';
  is_pinned: boolean;
  view_count: number;
  reply_count: number;
  like_count: number;
  location_label?: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at?: string;
  category_name: string | null;
  category_slug: string | null;
  category_color?: string | null;
  category_icon?: string | null;
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
  source?: 'USER' | 'SYSTEM' | 'GITHUB_ISSUE' | 'GITHUB_PR' | 'RSS' | 'IMPORT' | 'API';
  slug?: string | null;
  title: string;
  content: string;
  content_language?: string;
  content_format?: 'tiptap_json';
  content_html: string | null;
  content_json?: Record<string, unknown> | null;
  content_schema_version?: number;
  content_text?: string | null;
  status: 'draft' | 'published' | 'pending' | 'deleted';
  reject_reason?: string | null;
  is_pinned: boolean;
  view_count: number;
  reply_count?: number;
  like_count: number;
  location_label?: string | null;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  category_slug: string | null;
  category_color?: string | null;
  category_icon?: string | null;
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
  content_language?: string;
  content_format?: 'tiptap_json';
  content_json?: Record<string, unknown>;
  content_schema_version?: number;
  category_id?: number;
  tags?: string[];
  status?: 'draft' | 'published';
}

// Reply types
export interface Reply {
  child_count?: number;
  id: number;
  post_id: number;
  user_id: number;
  parent_reply_id: number | null;
  content: string;
  content_html: string | null;
  content_json?: Record<string, unknown> | null;
  content_schema_version?: number;
  content_text?: string | null;
  post_title?: string | null;
  status: 'active' | 'published' | 'pending' | 'deleted';
  like_count: number;
  location_label?: string | null;
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
  content_json?: Record<string, unknown>;
  content_schema_version?: number;
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
  community_posts: number;
  automated_posts: number;
  total_replies: number;
  total_users: number;
  total_resources: number;
  active_24h: number;
  active_24h_observed_since?: string;
  active_24h_complete?: boolean;
  today_posts: number;
  today_community_posts: number;
  today_automated_posts: number;
  today_replies: number;
  today_users: number;
  today_resources: number;
  pending_resources: number;
  pending_reports: number;
  average_report_resolution_hours: number | null;
  zero_result_searches_7d: number;
  activity_7d: number[];
  resource_type_breakdown: Array<{ type: string; count: number }>;
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
  last_location_label?: string | null;
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
  user_id?: number;
  file_name: string;
  file_path?: string;
  file_size: number;
  mime_type: string;
  download_count?: number;
  renderer_status?: string | null;
  renderer_resource_id?: string | null;
  renderer_error_code?: string | null;
  created_at: string;
}

export interface AttachmentDraft {
  id: number;
  token: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  expires_at: string;
}

export interface CustomEmojiSummary {
  id: number;
  name: string;
  shortcode: string;
  sort_order: number;
  image_url: string;
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
  content_hash?: string | null;
  external_url: string | null;
  version: string | null;
  content: string | null;
  content_language?: string;
  content_html: string | null;
  content_json?: Record<string, unknown> | null;
  content_schema_version?: number;
  content_text?: string | null;
  category_id: number | null;
  category_name: string | null;
  category_icon: string | null;
  download_count: number;
  view_count?: number | string;
  is_featured?: number | boolean;
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
  metadata?: ResourceDetailMetadata;
  renderer_status?: 'processing' | 'ready' | 'failed' | 'unavailable' | null;
  renderer_error_code?: string | null;
  renderer_metadata?: MindustryRendererMetadata | Record<string, unknown> | null;
  preview_url?: string | null;
  favorite_count?: number;
  is_favorited?: boolean;
  like_count?: number;
  is_liked?: boolean;
  comment_count?: number;
  is_subscribed?: boolean;
  versions?: ResourceVersion[];
}

export interface ResourceDetailMetadata {
  cover_image_url: string | null;
  gallery_images: string[];
  tags: string[];
  supported_versions: string[];
  compatibility: string[];
  planets: string[];
  game_modes: string[];
  required_mods: string[];
  changelog: string | null;
}

export interface MindustryRendererMetadata {
  name?: string;
  author?: string;
  description?: string;
  width?: number;
  height?: number;
  spawns?: number;
  version?: number;
  build?: number;
  save_format_version?: number | null;
  schematic_format_version?: number | null;
  map_build_metadata?: { stored_game_build?: number | null; source?: string };
  parser_runtime?: { mindustry_build?: number; renderer_version?: string };
  compatibility?: { minimum_supported_build?: number | null; confidence?: 'low' | 'medium' | 'high'; unknown_content?: string[] };
  structure_hashes?: { exact?: string; normalized?: string };
  planet?: string;
  game_modes?: string[];
  teams?: string[];
  tags?: string[];
  mod_dependencies?: string[];
  waves?: boolean;
  wave_groups?: Array<Record<string, unknown>>;
  banned_blocks?: string[];
  banned_units?: string[];
  core_count?: number;
  cores?: Array<Record<string, unknown>>;
  core_teams?: string[];
  rules?: Record<string, unknown>;
  blocks?: number;
  block_count?: number;
  block_types?: Array<{ name?: string; count?: number }>;
  block_positions?: Array<{ block?: string; x?: number; y?: number; rotation?: number; config?: unknown }>;
  block_positions_truncated?: boolean;
  requirements?: Array<{ item?: string; amount?: number }>;
  power_production?: number;
  power_consumption?: number;
  net_power?: number;
  production?: Record<string, unknown> | null;
  labels?: string[];
}

export interface ResourceCategory {
  id: number;
  parent_id?: number | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
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
  checksum?: string | null;
  release_notes?: string | null;
  release_notes_markdown?: string | null;
  published_at?: string | null;
  created_at: string;
  compatibility?: Array<{
    runtime: string;
    min_version_value: string | null;
    max_version_value: string | null;
    channel: string | null;
    notes: string | null;
    provenance: 'file_metadata' | 'inferred' | 'user_declared' | 'verified' | 'admin_verified';
    confidence: 'low' | 'medium' | 'high' | null;
  }>;
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

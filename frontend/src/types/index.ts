// User types
export type UserRole = 'guest' | 'user' | 'moderator' | 'admin';

export interface User {
  id: number;
  mindauthId: number;
  username: string;
  email: string;
  role: UserRole;
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
}

// Tag types
export interface Tag {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

// Post types
export interface Post {
  id: number;
  user_id: number;
  category_id: number | null;
  title: string;
  content: string;
  content_html: string;
  status: 'draft' | 'published' | 'deleted';
  is_pinned: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  category_slug: string | null;
  author_mindauth_id: number;
  author_role: UserRole;
  tags: Tag[];
  replies?: Reply[];
}

export interface PostListResponse {
  data: Post[];
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
  content_html: string;
  status: 'active' | 'deleted';
  created_at: string;
  updated_at: string;
  author_mindauth_id: number;
  author_role: UserRole;
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

export type PostStatus = 'draft' | 'published' | 'archived' | 'deleted';

export interface Post {
  id: number;
  user_id: number;
  category_id: number;
  title: string;
  content: string;
  content_html?: string;
  status: PostStatus;
  is_pinned: boolean;
  view_count: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string;
  user?: import('./user').User;
  category?: Category;
  reply_count?: number;
  tags?: Tag[];
}

export interface Reply {
  id: number;
  post_id: number;
  user_id: number;
  parent_reply_id?: number;
  content: string;
  content_html?: string;
  status: PostStatus;
  created_at: string;
  updated_at?: string;
  user?: import('./user').User;
  children?: Reply[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  post_count?: number;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
  post_count?: number;
}

export interface Bookmark {
  id: number;
  user_id: number;
  post_id: number;
  created_at: string;
  post?: Post;
}

export interface PostListOptions {
  category_id?: number;
  tag_id?: number;
  user_id?: number;
  status?: PostStatus;
  is_pinned?: boolean;
  sort_by?: 'created_at' | 'view_count' | 'reply_count';
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
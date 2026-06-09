import { categoryApi, postApi, tagApi } from '@/lib/api/client';
import Sidebar from '@/components/forum/sidebar';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import ServerSection from '@/components/forum/server-section';
import { Category, Post, Tag, PostListResponse } from '@/types';
import Link from 'next/link';

export const revalidate = 30;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_BASE}/api/categories`, { next: { tags: ['categories'] } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.success ? json.data : [];
  } catch {
    return [];
  }
}

async function fetchTags(): Promise<Tag[]> {
  try {
    const res = await fetch(`${API_BASE}/api/tags`, { next: { tags: ['tags'] } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.success ? json.data : [];
  } catch {
    return [];
  }
}

async function fetchSettings(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_BASE}/api/settings`, { next: { revalidate: 60 } });
    if (!res.ok) return {};
    const json = await res.json();
    return json.success ? json.data : {};
  } catch {
    return {};
  }
}

async function fetchPosts(page: number, limit: number, categoryId?: number): Promise<PostListResponse> {
  try {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('limit', String(limit));
    if (categoryId) qs.set('category_id', String(categoryId));
    const res = await fetch(`${API_BASE}/api/posts?${qs}`, { next: { tags: ['posts'] } });
    if (!res.ok) return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } };
    const json = await res.json();
    if (!json.success) return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } };
    // Response is wrapped by ResponseInterceptor: { success: true, data: { data: [...], total, page, ... } }
    const responseData = json.data || {};
    return {
      data: Array.isArray(responseData.data) ? responseData.data : Array.isArray(json.data) ? json.data : [],
      pagination: {
        page: responseData.page || 1,
        limit: responseData.limit || limit,
        total: responseData.total || 0,
        totalPages: responseData.totalPages || 1,
      },
    };
  } catch {
    return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } };
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { page?: string; category_id?: string };
}) {
  const page = parseInt(searchParams.page || '1');
  const categoryId = searchParams.category_id ? parseInt(searchParams.category_id) : undefined;

  const settings = await fetchSettings();
  const postsPerPage = parseInt(settings?.posts_per_page || '20');

  const [categories, tags, postsResult] = await Promise.all([
    fetchCategories(),
    fetchTags(),
    fetchPosts(page, postsPerPage, categoryId),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-8">
        {/* Left Sidebar */}
        <div className="hidden lg:block w-52 flex-shrink-0">
          <Sidebar
            categories={categories}
            tags={tags}
            selectedCategory={categoryId}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-4">
          {/* 服务器区域 - 在帖子列表上方 */}
          <ServerSection />

          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-[var(--text)]">
              {categoryId
                ? categories.find((c) => c.id === categoryId)?.name || '分类'
                : '最新帖子'}
            </h1>
          </div>

          {postsResult.data.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[var(--text-secondary)] mb-4">暂无帖子</p>
              <Link
                href="/posts/new"
                className="inline-flex items-center px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-lg hover:bg-[var(--primary-dark)] transition-colors"
              >
                发布第一篇帖子
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {postsResult.data.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          <Pagination
            currentPage={postsResult.pagination.page}
            totalPages={postsResult.pagination.totalPages}
            basePath="/"
            queryParams={categoryId ? { category_id: String(categoryId) } : {}}
          />
        </div>
      </div>
    </div>
  );
}
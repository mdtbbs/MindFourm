import { categoryApi, postApi, tagApi } from '@/lib/api/client';
import Sidebar from '@/components/forum/sidebar';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import { Category, Post, Tag, PostListResponse } from '@/types';

export const revalidate = 30;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/categories`, { next: { tags: ['categories'] } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.success ? json.data : [];
  } catch {
    return [];
  }
}

async function fetchTags(): Promise<Tag[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/tags`, { next: { tags: ['tags'] } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.success ? json.data : [];
  } catch {
    return [];
  }
}

async function fetchPosts(page: number, categoryId?: number): Promise<PostListResponse> {
  try {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('limit', '20');
    if (categoryId) qs.set('category_id', String(categoryId));
    const res = await fetch(`${API_BASE}/api/v1/posts?${qs}`, { next: { tags: ['posts'] } });
    if (!res.ok) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    const json = await res.json();
    if (!json.success) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    return {
      data: json.data || [],
      pagination: json.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 },
    };
  } catch {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { page?: string; category_id?: string };
}) {
  const page = parseInt(searchParams.page || '1');
  const categoryId = searchParams.category_id ? parseInt(searchParams.category_id) : undefined;

  const [categories, tags, postsResult] = await Promise.all([
    fetchCategories(),
    fetchTags(),
    fetchPosts(page, categoryId),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-8">
        {/* Left Sidebar */}
        <div className="hidden lg:block w-64 flex-shrink-0">
          <Sidebar
            categories={categories}
            tags={tags}
            selectedCategory={categoryId}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-surface-900">
              {categoryId
                ? categories.find((c) => c.id === categoryId)?.name || '分类'
                : '最新帖子'}
            </h1>
          </div>

          {postsResult.data.length === 0 ? (
            <div className="text-center py-12 text-surface-500">
              暂无帖子
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
            basePath={categoryId ? `/categories/${categoryId}` : '/'}
          />
        </div>
      </div>
    </div>
  );
}

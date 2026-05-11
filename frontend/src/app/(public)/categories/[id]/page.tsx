import { categoryApi, tagApi } from '@/lib/api/client';
import Sidebar from '@/components/forum/sidebar';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import { Category, Tag, PostListResponse } from '@/types';
import { notFound } from 'next/navigation';

async function fetchPosts(page: number, categoryId: number): Promise<PostListResponse> {
  try {
    const baseUrl = process.env.API_URL || 'http://localhost:4000';
    const res = await fetch(`${baseUrl}/api/posts?page=${page}&limit=20&category_id=${categoryId}`, { cache: 'no-store' });
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

async function fetchCategories(): Promise<Category[]> {
  try {
    const baseUrl = process.env.API_URL || 'http://localhost:4000';
    const res = await fetch(`${baseUrl}/api/categories`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.success ? json.data : [];
  } catch {
    return [];
  }
}

async function fetchTags(): Promise<Tag[]> {
  try {
    const baseUrl = process.env.API_URL || 'http://localhost:4000';
    const res = await fetch(`${baseUrl}/api/tags`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.success ? json.data : [];
  } catch {
    return [];
  }
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string };
}) {
  const categoryId = parseInt(params.id);
  const page = parseInt(searchParams.page || '1');

  const [category, postsResult, categories, tags] = await Promise.all([
    categoryApi.getById(categoryId).catch(() => null),
    fetchPosts(page, categoryId),
    fetchCategories(),
    fetchTags(),
  ]);

  if (!category) return notFound();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-8">
        <div className="hidden lg:block w-64 flex-shrink-0">
          <Sidebar
            categories={categories}
            tags={tags}
            selectedCategory={categoryId}
          />
        </div>
        <div className="flex-1 space-y-4">
          <h1 className="text-2xl font-bold text-surface-900">{category.name}</h1>
          {postsResult.data.length === 0 ? (
            <div className="text-center py-12 text-surface-500">该分类下暂无帖子</div>
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
            basePath={`/categories/${categoryId}`}
          />
        </div>
      </div>
    </div>
  );
}

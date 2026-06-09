import { Metadata } from 'next';
import Link from 'next/link';
import Sidebar from '@/components/forum/sidebar';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import { Category, Tag, PostListResponse } from '@/types';
import { notFound } from 'next/navigation';

export const revalidate = 300;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchPosts(page: number, categoryId: number): Promise<PostListResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/posts?page=${page}&limit=20&category_id=${categoryId}`, { next: { tags: ['posts'] } });
    if (!res.ok) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    const json = await res.json();
    if (!json.success) return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
    const responseData = json.data || {};
    return {
      data: Array.isArray(responseData.data) ? responseData.data : Array.isArray(json.data) ? json.data : [],
      pagination: {
        page: responseData.page || 1,
        limit: responseData.limit || 20,
        total: responseData.total || 0,
        totalPages: responseData.totalPages || 1,
      },
    };
  } catch {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  }
}

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

async function fetchCategory(id: number): Promise<Category | null> {
  try {
    const res = await fetch(`${API_BASE}/api/categories/${id}`, { next: { tags: ['categories'] } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const category = await fetchCategory(parseInt(params.id));
  if (!category) return { title: 'Not Found' };
  return {
    title: `${category.name} | MindForum`,
    openGraph: {
      title: `${category.name} | MindForum`,
      type: 'website',
    },
  };
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
    fetchCategory(categoryId),
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
            <div className="text-center py-12">
              <p className="text-surface-500 mb-4">该分类下暂无帖子</p>
              <Link href="/posts/new" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
                发布第一篇帖子 &rarr;
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
            basePath={`/categories/${categoryId}`}
          />
        </div>
      </div>
    </div>
  );
}

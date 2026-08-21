import { Metadata } from 'next';
import ForumContentLayout from '@/components/forum/forum-content-layout';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import EmptyState from '@/components/ui/empty-state';
import { MessageCircle } from 'lucide-react';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiData, fetchApiPaginated } from '@/lib/api/server-fetch';
import { Category, PostListResponse } from '@/types';
import { notFound } from 'next/navigation';

export const revalidate = 300;

async function fetchPosts(page: number, categoryId: number): Promise<PostListResponse> {
  return fetchApiPaginated<PostListResponse['data'][number]>(`/api/posts?page=${page}&limit=20&category_id=${categoryId}`, {
    init: { cache: 'no-store' },
    fallback: createEmptyPaginatedResult<PostListResponse['data'][number]>(20),
    forwardCookies: true,
  });
}

async function fetchCategories(): Promise<Category[]> {
  return fetchApiData<Category[]>('/api/categories', {
    init: { next: { tags: ['categories'] } },
    fallback: [],
  });
}

async function fetchCategory(id: number): Promise<Category | null> {
  return fetchApiData<Category | null>(`/api/categories/${id}`, {
    init: { next: { tags: ['categories'] } },
    fallback: null,
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const category = await fetchCategory(parseInt(id));
  if (!category) {
    // Not in the page body: `loading.tsx` flushes a 200 shell before the body runs, and
    // `notFound()` cannot change an already-sent status. generateMetadata runs first.
    notFound();
  }

  // Bare title — the root layout's `title.template` appends the site suffix. Hardcoding
  // it here produced "分类名 | MindForum | MindForum".
  const description = `${category.name} 分类下的全部帖子`;
  const canonical = `/categories/${category.id}`;

  return {
    title: category.name,
    description,
    alternates: { canonical },
    openGraph: {
      title: category.name,
      description,
      type: 'website',
      url: canonical,
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: pageStr } = await searchParams;
  const categoryId = parseInt(id);
  const page = parseInt(pageStr || '1');

  const [category, postsResult] = await Promise.all([
    fetchCategory(categoryId),
    fetchPosts(page, categoryId),
  ]);

  if (!category) return notFound();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <ForumContentLayout>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold text-surface-900">{category.name}</h1>
          {postsResult.data.length === 0 ? (
            <EmptyState
              icon={<MessageCircle className="h-10 w-10" />}
              title="这里还没有主题"
              description="有什么想讨论的吗？成为第一个发布内容的人。"
              action={{ label: '发布主题', href: '/posts/new' }}
            />
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
      </ForumContentLayout>
    </div>
  );
}

import { postApi } from '@/lib/api/client';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import { Post, PostListResponse } from '@/types';

export const revalidate = 0;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchPosts(query: string, page: number, limit: number): Promise<PostListResponse> {
  try {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('limit', String(limit));
    qs.set('search', query);
    const res = await fetch(`${API_BASE}/api/v1/posts?${qs}`, { next: { revalidate: 0 } });
    if (!res.ok) return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } };
    const json = await res.json();
    if (!json.success) return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } };
    return {
      data: json.data || [],
      pagination: json.pagination || { page: 1, limit, total: 0, totalPages: 1 },
    };
  } catch {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  }
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const query = searchParams.q || '';
  const page = parseInt(searchParams.page || '1');
  const postsPerPage = 20;

  const postsResult = query ? await fetchPosts(query, page, postsPerPage) : { data: [], pagination: { page: 1, limit: postsPerPage, total: 0, totalPages: 1 } };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">
          搜索结果
          {query && <span className="text-surface-500 font-normal text-lg ml-2">&ldquo;{query}&rdquo;</span>}
        </h1>
        {postsResult.pagination.total > 0 && (
          <p className="text-sm text-surface-500 mt-1">
            找到 {postsResult.pagination.total} 条结果
          </p>
        )}
      </div>

      {postsResult.data.length === 0 ? (
        <div className="text-center py-12 text-surface-500">
          {query ? '没有找到匹配的帖子' : '请输入搜索关键词'}
        </div>
      ) : (
        <div className="space-y-3">
          {postsResult.data.map((post: Post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {postsResult.pagination.totalPages > 1 && (
        <Pagination
          currentPage={postsResult.pagination.page}
          totalPages={postsResult.pagination.totalPages}
          basePath="/search"
          queryParams={query ? { q: query } : {}}
        />
      )}
    </div>
  );
}

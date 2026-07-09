import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import SearchEnhancements from '@/components/forum/search-enhancements';
import { SearchResultResponse } from '@/types';

export const revalidate = 0;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchPosts(query: string, page: number, limit: number): Promise<SearchResultResponse> {
  try {
    const qs = new URLSearchParams();
    qs.set('q', query);
    qs.set('page', String(page));
    qs.set('limit', String(limit));

    const res = await fetch(`${API_BASE}/api/search?${qs.toString()}`, { next: { revalidate: 0 } });
    if (!res.ok) return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } };

    const json = await res.json();
    if (!json.success) return { data: [], pagination: { page: 1, limit, total: 0, totalPages: 1 } };

    const responseData = json.data || {};
    return {
      data: Array.isArray(responseData.data) ? responseData.data : [],
      pagination: {
        page: responseData.pagination?.page || responseData.page || 1,
        limit: responseData.pagination?.limit || responseData.limit || limit,
        total: responseData.pagination?.total || responseData.total || 0,
        totalPages: responseData.pagination?.totalPages || responseData.totalPages || 1,
      },
      popular_searches: Array.isArray(responseData.popular_searches) ? responseData.popular_searches : undefined,
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
          {postsResult.data.map((post) => (
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

      <SearchEnhancements />
    </div>
  );
}

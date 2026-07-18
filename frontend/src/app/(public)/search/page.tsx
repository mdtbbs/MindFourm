import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import SearchEnhancements from '@/components/forum/search-enhancements';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiPaginated } from '@/lib/api/server-fetch';
import { SearchResultResponse } from '@/types';

export const revalidate = 0;

async function fetchPosts(query: string, page: number, limit: number): Promise<SearchResultResponse> {
  const qs = new URLSearchParams();
  qs.set('q', query);
  qs.set('page', String(page));
  qs.set('limit', String(limit));

  return fetchApiPaginated<SearchResultResponse['data'][number], { popular_searches?: string[] }>(`/api/search?${qs.toString()}`, {
    init: { next: { revalidate: 0 } },
    fallback: {
      ...createEmptyPaginatedResult<SearchResultResponse['data'][number]>(limit),
      popular_searches: undefined,
    },
  });
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.q || '';
  const page = parseInt(params.page || '1', 10);
  const postsPerPage = 20;

  const postsResult = query
    ? await fetchPosts(query, page, postsPerPage)
    : ({
        ...createEmptyPaginatedResult<SearchResultResponse['data'][number]>(postsPerPage),
        popular_searches: undefined,
      } satisfies SearchResultResponse);

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

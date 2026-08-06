import type { Metadata } from 'next';
import PostCard from '@/components/forum/post-card';
import ResourceCard from '@/components/forum/resource-card';
import Pagination from '@/components/ui/pagination';
import SearchEnhancements from '@/components/forum/search-enhancements';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiPaginated } from '@/lib/api/server-fetch';
import { fetchApiData } from '@/lib/api/server-fetch';
import { SearchResultResponse, Resource } from '@/types';
import ErrorState from '@/components/ui/error-state';
import EmptyState from '@/components/ui/empty-state';

export const revalidate = 0;

/**
 * Search result pages are never indexed.
 *
 * `/search?q=<anything>` generates unlimited near-duplicate pages out of other
 * pages' content — a classic thin-content farm. `follow` stays on so links out of a
 * result page are still discovered. robots.txt disallows the path too; this covers
 * crawlers arriving from an external link regardless.
 */
export const metadata: Metadata = {
  title: '搜索',
  robots: { index: false, follow: true },
};

async function fetchPosts(query: string, page: number, limit: number): Promise<SearchResultResponse> {
  const qs = new URLSearchParams();
  qs.set('q', query);
  qs.set('page', String(page));
  qs.set('limit', String(limit));

  return fetchApiPaginated<SearchResultResponse['data'][number], { popular_searches?: string[]; resources?: any[] }>(`/api/search?${qs.toString()}`, {
    init: { next: { revalidate: 0 } },
    fallback: {
      ...createEmptyPaginatedResult<SearchResultResponse['data'][number]>(limit),
      popular_searches: undefined,
      resources: [],
    },
    throwOnError: true,
  });
}

async function fetchResources(query: string): Promise<Resource[]> {
  if (!query) return [];

  const qs = new URLSearchParams();
  qs.set('q', query);

  const result = await fetchApiData<{ resources?: Resource[] }>(`/api/search?${qs.toString()}`, {
    init: { next: { revalidate: 0 } },
    fallback: { resources: [] },
    throwOnError: true,
  });

  return result.resources || [];
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

  let postsResult: SearchResultResponse;
  let resources: Resource[];
  try {
    [postsResult, resources] = query
      ? await Promise.all([fetchPosts(query, page, postsPerPage), fetchResources(query)])
      : [
          {
            ...createEmptyPaginatedResult<SearchResultResponse['data'][number]>(postsPerPage),
            popular_searches: undefined,
            resources: [],
          } satisfies SearchResultResponse,
          [] as Resource[],
        ];
  } catch {
    return <ErrorState title="搜索失败" description="暂时无法获取搜索结果，请稍后重试。" action={{ label: '返回搜索', href: '/search' }} />;
  }

  const totalResults = postsResult.pagination.total + resources.length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-surface-900">
          搜索结果
          {query && <span className="text-surface-500 font-normal text-lg ml-2">&ldquo;{query}&rdquo;</span>}
        </h1>
        {totalResults > 0 && (
          <p className="text-sm text-surface-500 mt-1">
            找到 {totalResults} 条结果
            {postsResult.pagination.total > 0 && resources.length > 0 && (
              <span className="ml-2">
                ({postsResult.pagination.total} 个帖子，{resources.length} 个资源)
              </span>
            )}
          </p>
        )}
      </div>

      {postsResult.data.length === 0 && resources.length === 0 ? (
        <EmptyState title={query ? '没有找到匹配的结果' : '请输入搜索关键词'} className="border-0 bg-transparent" />
      ) : (
        <div className="space-y-6">
          {resources.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-surface-900 mb-3">
                资源 ({resources.length})
              </h2>
              <div className="space-y-3">
                {resources.map((resource) => (
                  <ResourceCard key={resource.id} resource={resource} />
                ))}
              </div>
            </div>
          )}

          {postsResult.data.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-surface-900 mb-3">
                帖子 ({postsResult.pagination.total})
              </h2>
              <div className="space-y-3">
                {postsResult.data.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </div>
          )}
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

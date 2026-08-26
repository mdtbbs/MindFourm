import type { Metadata } from 'next';
import ThreadList from '@/components/forum/thread-list';
import Pagination from '@/components/ui/pagination';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiPaginated } from '@/lib/api/server-fetch';
import { PostListResponse } from '@/types';

async function fetchPosts(page: number, slug: string): Promise<PostListResponse> {
  // Encoded: an unencoded slug containing `../` is normalised by fetch and can reach
  // a different endpoint.
  return fetchApiPaginated<PostListResponse['data'][number]>(
    `/api/tags/${encodeURIComponent(slug)}/posts?page=${page}&limit=20`,
    {
      init: { cache: 'no-store' },
      fallback: createEmptyPaginatedResult<PostListResponse['data'][number]>(20),
      notFoundOn404: true,
    },
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const [{ slug }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const label = decodeURIComponent(slug);
  const page = Number.parseInt(pageParam || '1', 10);
  const isPaginated = Number.isFinite(page) && page > 1;
  const result = await fetchPosts(1, label);
  const postCount = result.pagination.total;
  const title = isPaginated ? `#${label} - 第 ${page} 页` : `#${label}`;
  const description = `浏览 MDTBBS 中与 ${label} 相关的讨论和资源。`;
  const canonical = isPaginated ? `/tags/${encodeURIComponent(label)}?page=${page}` : `/tags/${encodeURIComponent(label)}`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: postCount >= 3, follow: true },
    openGraph: { title, description, type: 'website', url: `/tags/${slug}` },
  };
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const { page: pageStr } = await searchParams;
  const page = parseInt(pageStr || '1');

  const postsResult = await fetchPosts(page, decodedSlug);

  const tagName = postsResult.data.length > 0 && postsResult.data[0].tags
    ? postsResult.data[0].tags.find((t) => t.slug === decodedSlug)?.name
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-surface-900 mb-6">
        标签: {tagName || decodedSlug}
      </h1>
      {postsResult.data.length === 0 ? (
        <div className="text-center py-12 text-surface-500">该标签下暂无帖子</div>
      ) : (
        <ThreadList posts={postsResult.data} />
      )}
      <Pagination
        currentPage={postsResult.pagination.page}
        totalPages={postsResult.pagination.totalPages}
        basePath={`/tags/${encodeURIComponent(decodedSlug)}`}
      />
    </div>
  );
}

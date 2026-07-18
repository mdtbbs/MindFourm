import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import { createEmptyPaginatedResult } from '@/lib/api/response';
import { fetchApiPaginated } from '@/lib/api/server-fetch';
import { PostListResponse } from '@/types';

async function fetchPosts(page: number, slug: string): Promise<PostListResponse> {
  return fetchApiPaginated<PostListResponse['data'][number]>(`/api/tags/${slug}/posts?page=${page}&limit=20`, {
    init: { cache: 'no-store' },
    fallback: createEmptyPaginatedResult<PostListResponse['data'][number]>(20),
    notFoundOn404: true,
  });
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = parseInt(pageStr || '1');

  const postsResult = await fetchPosts(page, slug);

  const tagName = postsResult.data.length > 0 && postsResult.data[0].tags
    ? postsResult.data[0].tags.find((t) => t.slug === slug)?.name
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-surface-900 mb-6">
        标签: {tagName || slug}
      </h1>
      {postsResult.data.length === 0 ? (
        <div className="text-center py-12 text-surface-500">该标签下暂无帖子</div>
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
        basePath={`/tags/${slug}`}
      />
    </div>
  );
}

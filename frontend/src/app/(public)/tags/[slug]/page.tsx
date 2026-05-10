import { tagApi } from '@/lib/api/client';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import { Post, Tag, PostListResponse } from '@/types';

export default async function TagPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { page?: string };
}) {
  const slug = params.slug;
  const page = parseInt(searchParams.page || '1');

  let postsResult: PostListResponse = {
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  };

  try {
    postsResult = await tagApi.getPostsByTag(slug, page);
  } catch {
    // No posts for this tag
  }

  const tagName = postsResult.data.length > 0
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

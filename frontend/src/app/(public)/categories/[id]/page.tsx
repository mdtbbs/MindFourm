import { categoryApi, postApi, tagApi } from '@/lib/api/client';
import Sidebar from '@/components/forum/sidebar';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import { Category, Post, Tag, PostListResponse } from '@/types';
import { notFound } from 'next/navigation';

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
    postApi.getList({ page, limit: 20, category_id: categoryId }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    })),
    categoryApi.getList().catch(() => []),
    tagApi.getList().catch(() => []),
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

import { categoryApi, postApi, tagApi } from '@/lib/api/client';
import Sidebar from '@/components/forum/sidebar';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import { Category, Post, Tag, PostListResponse } from '@/types';

async function fetchCategories(): Promise<Category[]> {
  try {
    return await categoryApi.getList();
  } catch {
    return [];
  }
}

async function fetchTags(): Promise<Tag[]> {
  try {
    return await tagApi.getList();
  } catch {
    return [];
  }
}

async function fetchPosts(page: number, categoryId?: number): Promise<PostListResponse> {
  try {
    const params: { page: number; limit: number; category_id?: number } = {
      page,
      limit: 20,
    };
    if (categoryId) params.category_id = categoryId;
    return await postApi.getList(params);
  } catch {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { page?: string; category_id?: string };
}) {
  const page = parseInt(searchParams.page || '1');
  const categoryId = searchParams.category_id ? parseInt(searchParams.category_id) : undefined;

  const [categories, tags, postsResult] = await Promise.all([
    fetchCategories(),
    fetchTags(),
    fetchPosts(page, categoryId),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-8">
        {/* Left Sidebar */}
        <div className="hidden lg:block w-64 flex-shrink-0">
          <Sidebar
            categories={categories}
            tags={tags}
            selectedCategory={categoryId}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-surface-900">
              {categoryId
                ? categories.find((c) => c.id === categoryId)?.name || '分类'
                : '最新帖子'}
            </h1>
          </div>

          {postsResult.data.length === 0 ? (
            <div className="text-center py-12 text-surface-500">
              暂无帖子
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
            basePath={categoryId ? `/categories/${categoryId}` : '/'}
          />
        </div>
      </div>
    </div>
  );
}

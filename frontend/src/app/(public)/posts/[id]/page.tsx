import { notFound } from 'next/navigation';
import { categoryApi } from '@/lib/api/client';
import PostContent from '@/components/forum/post-content';
import ReplyItem from '@/components/forum/reply-item';
import Pagination from '@/components/ui/pagination';
import Link from 'next/link';
import { Category, Post, ReplyListResponse } from '@/types';

async function fetchPost(id: number): Promise<Post | null> {
  try {
    const baseUrl = process.env.API_URL || 'http://localhost:4000';
    const res = await fetch(`${baseUrl}/api/posts/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

async function fetchCategories(): Promise<Category[]> {
  try {
    return await categoryApi.getList();
  } catch {
    return [];
  }
}

async function fetchReplies(postId: number, page: number): Promise<ReplyListResponse> {
  try {
    const baseUrl = process.env.API_URL || 'http://localhost:4000';
    const res = await fetch(`${baseUrl}/api/posts/${postId}/replies?page=${page}&limit=50`, { cache: 'no-store' });
    if (!res.ok) return { data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } };
    const json = await res.json();
    if (!json.success) return { data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } };
    return {
      data: json.data || [],
      pagination: json.pagination || { page: 1, limit: 50, total: 0, totalPages: 1 },
    };
  } catch {
    return { data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } };
  }
}

export default async function PostDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string };
}) {
  const postId = parseInt(params.id);
  const page = parseInt(searchParams.page || '1');

  const [post, categories, repliesResult] = await Promise.all([
    fetchPost(postId),
    fetchCategories(),
    fetchReplies(postId, page),
  ]);

  if (!post) {
    return notFound();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-surface-500">
        <Link href="/" className="hover:text-primary-600">首页</Link>
        <span className="mx-2">/</span>
        {post.category_name ? (
          <>
            <Link href={`/categories/${post.category_id}`} className="hover:text-primary-600">
              {post.category_name}
            </Link>
            <span className="mx-2">/</span>
          </>
        ) : null}
        <span className="text-surface-900">{post.title}</span>
      </nav>

      {/* Post Content */}
      <PostContent post={post} />

      {/* Replies */}
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-surface-900">
          回复 ({repliesResult.pagination.total})
        </h2>

        {repliesResult.data.length === 0 ? (
          <div className="text-center py-8 text-surface-500">暂无回复</div>
        ) : (
          <div className="space-y-4">
            {repliesResult.data.map((reply, index) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                index={(page - 1) * 50 + index}
              />
            ))}
          </div>
        )}

        <Pagination
          currentPage={repliesResult.pagination.page}
          totalPages={repliesResult.pagination.totalPages}
          basePath={`/posts/${postId}`}
        />
      </div>
    </div>
  );
}

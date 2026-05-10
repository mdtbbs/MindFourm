import { notFound } from 'next/navigation';
import { postApi, replyApi, categoryApi } from '@/lib/api/client';
import PostContent from '@/components/forum/post-content';
import ReplyItem from '@/components/forum/reply-item';
import ReplyEditor from '@/components/forum/reply-editor';
import Pagination from '@/components/ui/pagination';
import Link from 'next/link';
import { Category, Post, Reply, ReplyListResponse, UserRole } from '@/types';

async function fetchPost(id: number): Promise<Post | null> {
  try {
    return await postApi.getById(id);
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
    return await replyApi.getByPost(postId, { page, limit: 50 });
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
                onQuote={() => {}}
                onReply={() => {}}
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

      {/* Reply Editor */}
      <div className="mt-8">
        <ReplyEditor
          postId={postId}
          onSubmit={async (content, parentReplyId) => {
            // Client-side submission will be wired up later
            console.log('Submit reply:', { content, parentReplyId });
          }}
        />
      </div>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import PostContent from '@/components/forum/post-content';
import ReplyItem from '@/components/forum/reply-item';
import ReplyFormWrapper from '@/components/forum/reply-form-wrapper';
import Pagination from '@/components/ui/pagination';
import AttachmentList from '@/components/forum/attachment-list';
import Link from 'next/link';
import { fetchApiData } from '@/lib/api/server-fetch';
import { Post, Attachment } from '@/types';

export const revalidate = 60;

async function fetchSettings(): Promise<Record<string, string>> {
  return fetchApiData<Record<string, string>>('/api/settings', {
    init: { next: { revalidate: 60 } },
    fallback: {},
  });
}

async function fetchPost(id: number, page: number, limit: number): Promise<Post | null> {
  return fetchApiData<Post | null>(`/api/posts/${id}?reply_page=${page}&reply_limit=${limit}`, {
    init: { cache: 'no-store' },
    fallback: null,
    forwardCookies: true,
  });
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const [post, settings] = await Promise.all([
    fetchPost(parseInt(params.id), 1, 1),
    fetchSettings(),
  ]);
  if (!post) return { title: 'Not Found' };
  const titleSuffix = settings.seo_title_suffix || ' | MindForum';
  const meta: Metadata = {
    title: `${post.title}${titleSuffix}`,
    description: post.content.slice(0, 160),
    openGraph: {
      title: `${post.title}${titleSuffix}`,
      description: post.content.slice(0, 160),
      type: 'article',
    },
  };
  if (settings.seo_og_image) {
    meta.openGraph = { ...meta.openGraph, images: [settings.seo_og_image] };
  }
  return meta;
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

  const settings = await fetchSettings();
  const repliesPerPage = parseInt(settings.replies_per_page || '50');
  const post = await fetchPost(postId, page, repliesPerPage);

  // Fetch attachments
  const attachments = await fetchApiData<Attachment[]>(`/api/attachments/post/${postId}`, {
    init: { cache: 'no-store' },
    fallback: [],
  });

  if (!post) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <article className="bg-[var(--bg-card)] dark:bg-gray-900 rounded-lg border border-[var(--border)] dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-[var(--border)] dark:border-gray-700">
            <h1 className="text-2xl font-bold text-[var(--text)] mb-3">帖子不存在</h1>
            <p className="text-sm text-[var(--text-secondary)]">该帖子可能已被删除或尚未发布。</p>
          </div>
          <div className="p-6" data-testid="post-content">
            <p className="text-sm text-[var(--text-secondary)]">暂无可显示内容</p>
          </div>
        </article>
      </div>
    );
  }

  const replies = post.replies ?? [];
  const pagination = post.replyPagination ?? { page: 1, limit: repliesPerPage, totalPages: 1, total: 0 };
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-[var(--text-secondary)]">
        <Link href="/" className="hover:text-[var(--primary)]">首页</Link>
        <span className="mx-2">/</span>
        {post.category_name ? (
          <>
            <Link href={`/categories/${post.category_id}`} className="hover:text-[var(--primary)]">
              {post.category_name}
            </Link>
            <span className="mx-2">/</span>
          </>
        ) : null}
        <span className="text-[var(--text)]">{post.title}</span>
      </nav>

      {/* Pending moderation banner */}
      {post.status === 'pending' && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">此帖子正在等待审核</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              {post.current_user_role === 'admin' || post.current_user_role === 'moderator'
                ? '您可以审核此帖子。'
                : '审核通过后将对其他用户可见。如有疑问请联系管理组。'}
            </p>
          </div>
        </div>
      )}

      {/* Post Content */}
      <PostContent post={post} postId={postId} currentUserRole={post.current_user_role as any} />
      <AttachmentList attachments={attachments} />

      {/* Replies */}
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">
          回复 ({pagination.total})
        </h2>

        {replies.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-secondary)]">暂无回复，快来抢沙发吧</div>
        ) : (
          <div className="space-y-4">
            {replies.map((reply: any, index: number) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                index={(page - 1) * repliesPerPage + index}
              />
            ))}
          </div>
        )}

        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          basePath={`/posts/${postId}`}
        />
      </div>

      {/* Reply Form */}
      <div className="mt-8">
        <ReplyFormWrapper postId={postId} />
      </div>
    </div>
  );
}

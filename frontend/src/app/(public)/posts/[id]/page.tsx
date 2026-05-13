import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import PostContent from '@/components/forum/post-content';
import ReplyItem from '@/components/forum/reply-item';
import Pagination from '@/components/ui/pagination';
import Link from 'next/link';
import { Post } from '@/types';

export const revalidate = 60;

const API_BASE = process.env.API_URL || 'http://localhost:4000';

async function fetchSettings(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_BASE}/api/settings`, { next: { revalidate: 60 } });
    if (!res.ok) return {};
    const json = await res.json();
    return json.success ? json.data : {};
  } catch {
    return {};
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const res = await fetch(`${API_BASE}/api/v1/posts/${params.id}`, { next: { tags: [`post-${params.id}`] } });
  if (!res.ok) return { title: 'Not Found' };
  const json = await res.json();
  const post = json.success ? json.data : null;
  if (!post) return { title: 'Not Found' };

  const settings = await fetchSettings();
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
  const repliesPerPage = parseInt(settings?.replies_per_page || '50');

  const res = await fetch(`${API_BASE}/api/v1/posts/${postId}?page=${page}&limit=${repliesPerPage}`, { next: { tags: [`post-${postId}`] } });
  if (!res.ok) return notFound();
  const json = await res.json();
  if (!json.success) return notFound();

  const post = json.data;
  const repliesResult = {
    data: post.replies || [],
    pagination: post.repliesPagination || { page: 1, limit: repliesPerPage, total: 0, totalPages: 1 },
  };

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
            {repliesResult.data.map((reply: any, index: number) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                index={(page - 1) * repliesPerPage + index}
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

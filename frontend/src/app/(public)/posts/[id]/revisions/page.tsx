import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { fetchApiData } from '@/lib/api/server-fetch';
import { extractIdFromHybridParam } from '@/lib/seo/hybrid-param';
import type { PostRevisionSummary } from '@/lib/api/client';

// Viewer-dependent — only the author and staff may read it — so never cached.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '编辑历史',
  // History can contain text the author has since removed; keep it out of search.
  robots: { index: false, follow: false },
};

interface RevisionsPayload {
  data: PostRevisionSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export default async function PostRevisionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ id }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const postId = extractIdFromHybridParam(id) ?? parseInt(id);
  if (!Number.isFinite(postId)) notFound();

  const page = Math.max(1, parseInt(pageParam || '1'));

  // The API answers 403/404 for anyone who may not read this, and `fetchApiData` turns
  // a failure into the fallback — so an empty payload here means "not yours to see" just
  // as much as "never edited". Both resolve to a 404 page, which is the right answer for
  // a stranger and an acceptable one for an unedited post.
  const revisions = await fetchApiData<RevisionsPayload | null>(
    `/api/posts/${postId}/revisions?page=${page}&limit=20`,
    { init: { cache: 'no-store' }, fallback: null, forwardCookies: true },
  );

  if (!revisions) notFound();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href={`/posts/${postId}`}
        className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回帖子
      </Link>

      <h1 className="text-2xl font-semibold text-[var(--text)] mb-2">编辑历史</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        每条记录保存的是<span className="font-medium text-[var(--text)]">该次编辑之前</span>
        的内容；当前正文请回帖子页查看。共 {revisions.pagination.total} 条。
      </p>

      {revisions.data.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--text-muted)]">这篇帖子还没有被编辑过</p>
      ) : (
        <ol className="space-y-4">
          {revisions.data.map((revision) => (
            <li
              key={revision.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-sm">
                <span className="font-medium text-[var(--text)]">{revision.title}</span>
                <span className="text-[var(--text-muted)]">
                  编辑者 {revision.editor ? `#${revision.editor.id}` : '（已注销）'}
                </span>
                <time dateTime={revision.created_at} className="text-[var(--text-muted)]">
                  {new Date(revision.created_at).toLocaleString('zh-CN')}
                </time>
                <Link
                  href={`/posts/${postId}/revisions/${revision.id}`}
                  className="text-[var(--primary)] hover:underline"
                >
                  查看这一版
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}

      {revisions.pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          {page > 1 && (
            <Link
              href={`/posts/${postId}/revisions?page=${page - 1}`}
              className="text-[var(--primary)] hover:underline"
            >
              上一页
            </Link>
          )}
          <span className="text-[var(--text-secondary)]">
            第 {page} / {revisions.pagination.totalPages} 页
          </span>
          {page < revisions.pagination.totalPages && (
            <Link
              href={`/posts/${postId}/revisions?page=${page + 1}`}
              className="text-[var(--primary)] hover:underline"
            >
              下一页
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

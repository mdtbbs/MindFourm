import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { fetchApiData } from '@/lib/api/server-fetch';
import { extractIdFromHybridParam } from '@/lib/seo/hybrid-param';
import type { PostRevisionDetail } from '@/lib/api/client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '历史版本',
  robots: { index: false, follow: false },
};

export default async function PostRevisionPage({
  params,
}: {
  params: Promise<{ id: string; revisionId: string }>;
}) {
  const { id, revisionId: revisionParam } = await params;
  const postId = extractIdFromHybridParam(id) ?? parseInt(id);
  const revisionId = parseInt(revisionParam);
  if (!Number.isFinite(postId) || !Number.isFinite(revisionId)) notFound();

  const revision = await fetchApiData<PostRevisionDetail | null>(
    `/api/posts/${postId}/revisions/${revisionId}`,
    { init: { cache: 'no-store' }, fallback: null, forwardCookies: true },
  );

  if (!revision) notFound();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href={`/posts/${postId}/revisions`}
        className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        返回编辑历史
      </Link>

      <article className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        <header className="border-b border-[var(--border)] p-6">
          <h1 className="text-2xl font-bold text-[var(--text)] mb-2">{revision.title}</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            这是{' '}
            <time dateTime={revision.created_at}>
              {new Date(revision.created_at).toLocaleString('zh-CN')}
            </time>{' '}
            那次编辑之前的内容 · 编辑者{' '}
            {revision.editor ? `#${revision.editor.id}` : '（已注销）'}
          </p>
        </header>

        <div className="p-6">
          <MarkdownRenderer content={revision.content} />
        </div>
      </article>
    </div>
  );
}

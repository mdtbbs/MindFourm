import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { getNotice } from '@/lib/api/v1/notices';
import { V1ApiError } from '@/lib/api/v1/transport';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try { const notice = await getNotice((await params).id); return { title: `${notice.title} | MDTBBS`, description: notice.excerpt || undefined }; }
  catch { return { title: '公告中心 | MDTBBS' }; }
}

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  let notice;
  try { notice = await getNotice((await params).id); }
  catch (error) { if (error instanceof V1ApiError && error.status === 404) notFound(); throw error; }
  return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
    <article className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
        {notice.is_pinned && <span className="rounded bg-[var(--primary)]/10 px-2 py-0.5 font-semibold text-[var(--primary)]">置顶</span>}<span>{notice.notice_type}</span><span>·</span><span>{notice.author?.username || 'MDTBBS 管理组'}</span><span>·</span><time>{new Date(notice.published_at || notice.created_at).toLocaleString('zh-CN')}</time><span>·</span><span>{notice.view_count} 次阅读</span>
      </div>
      <h1 className="mt-4 text-3xl font-bold text-[var(--text)]">{notice.title}</h1>
      {notice.edited_at && <p className="mt-2 text-xs text-[var(--text-muted)]">最后更新：{new Date(notice.edited_at).toLocaleString('zh-CN')}</p>}
      <MarkdownRenderer content={notice.content_markdown} className="mt-8 text-[var(--text-secondary)]" />
    </article>
    {notice.revisions?.length ? <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-semibold text-[var(--text)]">更新记录</h2><ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">{notice.revisions.map((item) => <li key={item.id}>{new Date(item.created_at).toLocaleString('zh-CN')} · {item.editor?.username || 'MDTBBS 管理组'}{item.change_summary ? `：${item.change_summary}` : ''}</li>)}</ul></section> : null}
    {notice.related?.length ? <section className="mt-6"><h2 className="font-semibold text-[var(--text)]">相关推荐</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{notice.related.map((item) => <Link key={item.public_id} href={`/notices/${item.public_id}`} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--primary)]"><p className="font-medium text-[var(--text)]">{item.title}</p><p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">{item.excerpt}</p></Link>)}</div></section> : null}
    <Link href="/notices" className="mt-8 inline-flex text-sm font-medium text-[var(--primary)] hover:underline">返回公告中心</Link>
  </main>;
}

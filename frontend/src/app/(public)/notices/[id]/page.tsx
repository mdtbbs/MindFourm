import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { getNotice } from '@/lib/api/v1/notices';
import { V1ApiError } from '@/lib/api/v1/transport';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';
import { siteProfile } from '@/config/site-profile';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const locale = await getRequestLocale();
  try { const notice = await getNotice((await params).id); return { title: `${notice.title} | ${siteProfile.branding.siteName}`, description: notice.excerpt || undefined }; }
  catch { return { title: `${translate(locale, 'notices.title')} | ${siteProfile.branding.siteName}` }; }
}

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await getRequestLocale();
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);
  let notice;
  try { notice = await getNotice((await params).id); }
  catch (error) { if (error instanceof V1ApiError && error.status === 404) notFound(); throw error; }
  return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
    <article className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
        {notice.is_pinned && <span className="rounded bg-[var(--primary)]/10 px-2 py-0.5 font-semibold text-[var(--primary-text)]">{t('notices.pinned')}</span>}<span>{t(`notices.type.${notice.notice_type}`)}</span><span>·</span><span>{notice.author?.username || t('notices.communityTeam')}</span><span>·</span><time>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(notice.published_at || notice.created_at))}</time><span>·</span><span>{t('notices.readCount', { count: new Intl.NumberFormat(locale).format(notice.view_count) })}</span>
      </div>
      <h1 className="mt-4 text-3xl font-bold text-[var(--text)]">{notice.title}</h1>
      {notice.edited_at && <p className="mt-2 text-xs text-[var(--text-muted)]">{t('notices.lastUpdated', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(notice.edited_at)) })}</p>}
      <MarkdownRenderer content={notice.content_markdown} className="mt-8 text-[var(--text-secondary)]" />
    </article>
    {notice.revisions?.length ? <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-semibold text-[var(--text)]">{t('notices.revisionHistory')}</h2><ul className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">{notice.revisions.map((item) => <li key={item.id}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))} · {item.editor?.username || t('notices.communityTeam')}{item.change_summary ? `: ${item.change_summary}` : ''}</li>)}</ul></section> : null}
    {notice.related?.length ? <section className="mt-6"><h2 className="font-semibold text-[var(--text)]">{t('notices.related')}</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{notice.related.map((item) => <Link key={item.public_id} href={`/notices/${item.public_id}`} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 hover:border-[var(--primary)]"><p className="font-medium text-[var(--text)]">{item.title}</p><p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">{item.excerpt}</p></Link>)}</div></section> : null}
    <Link href="/notices" className="mt-8 inline-flex text-sm font-medium text-[var(--primary-text)] hover:underline">{t('notices.backToNotices')}</Link>
  </main>;
}

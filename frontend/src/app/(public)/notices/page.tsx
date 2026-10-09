import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchPublicSettings } from '@/lib/settings/server';
import { resolveBrand } from '@/lib/theme/brand';
import { generatePageMetadata } from '@/lib/metadata';
import { listNotices } from '@/lib/api/v1/notices';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const [settings, locale] = await Promise.all([fetchPublicSettings({ fresh: true }), getRequestLocale()]);
  return generatePageMetadata({
    title: translate(locale, 'notices.title'),
    brandInfo: resolveBrand(settings),
    openGraphImage: settings.seo_og_image,
  });
}

export default async function NoticesPage() {
  const locale = await getRequestLocale();
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);
  const result = await listNotices({ limit: 30 });
  const notices = result.data;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 border-b border-[var(--border)] pb-5">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--text-muted)]">{t('notices.updates')}</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text)]">{t('notices.title')}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('notices.description')}</p>
      </div>
      <div className="space-y-4">
        {notices.length ? notices.map((notice) => (
          <article key={notice.public_id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              {notice.is_pinned && <span className="rounded bg-[var(--primary)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--primary-text)]">{t('notices.pinned')}</span>}
              <span className="rounded bg-[var(--bg-muted)] px-2 py-0.5 text-xs text-[var(--text-muted)]">{t(`notices.type.${notice.notice_type}`)}</span>
              <h2 className="text-xl font-semibold text-[var(--text)]"><Link href={`/notices/${notice.public_id}`} className="hover:text-[var(--primary-text)]">{notice.title}</Link></h2>
              {notice.published_at && (
                <time className="ml-auto text-xs text-[var(--text-muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(notice.published_at))}</time>
              )}
            </div>
            <p className="mt-4 line-clamp-2 text-sm leading-7 text-[var(--text-secondary)]">{notice.excerpt || t('notices.viewDetails')}</p>
            <p className="mt-3 text-xs text-[var(--text-muted)]">{notice.author?.username || t('notices.communityTeam')} · {t('notices.readCount', { count: new Intl.NumberFormat(locale).format(notice.view_count) })}</p>
          </article>
        )) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-12 text-center text-sm text-[var(--text-muted)]">{t('notices.empty')}</div>
        )}
      </div>
      <Link href="/" className="mt-8 inline-flex text-sm font-medium text-[var(--primary-text)] hover:underline">{t('notices.backHome')}</Link>
    </main>
  );
}

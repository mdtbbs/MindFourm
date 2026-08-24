import type { Metadata } from 'next';
import Link from 'next/link';
import MarkdownRenderer from '@/components/ui/markdown-renderer';
import { fetchPublicSettings } from '@/lib/settings/server';
import { resolveBrand } from '@/lib/theme/brand';
import { generatePageMetadata } from '@/lib/metadata';
import { parseNotices, type Notice } from '@/lib/notices/parse-notices';

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await fetchPublicSettings({ fresh: true });
  return generatePageMetadata({ title: '公告中心', brandInfo: resolveBrand(settings) });
}

export default async function NoticesPage() {
  const settings = await fetchPublicSettings({ fresh: true });
  const notices = parseNotices(settings.notices_content);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 border-b border-[var(--border)] pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Community updates</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text)]">公告中心</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">论坛维护、活动和重要规则更新都会在这里保留。</p>
      </div>
      <div className="space-y-4">
        {notices.length ? notices.map((notice, index) => (
          <article key={`${notice.title}-${index}`} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              {notice.pinned && <span className="rounded bg-[var(--primary)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--primary)]">置顶</span>}
              <h2 className="text-xl font-semibold text-[var(--text)]">{notice.title}</h2>
              {/* Defensive check: only render time if published_at is a string */}
              {typeof notice.published_at === 'string' && notice.published_at && (
                <time className="ml-auto text-xs text-[var(--text-muted)]">{notice.published_at}</time>
              )}
            </div>
            <MarkdownRenderer content={notice.content} className="mt-4 text-sm leading-7 text-[var(--text-secondary)]" />
          </article>
        )) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-12 text-center text-sm text-[var(--text-muted)]">暂时没有公告。</div>
        )}
      </div>
      <Link href="/" className="mt-8 inline-flex text-sm font-medium text-[var(--primary)] hover:underline">返回论坛首页</Link>
    </main>
  );
}

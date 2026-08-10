import Link from 'next/link';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { getFooterSettings, isExternalHref } from '@/lib/footer/footer-settings';
import { fetchPublicSettings } from '@/lib/settings/server';

export const revalidate = 60;

export const metadata: Metadata = {
  title: '友情链接',
};

export default async function LinksPage() {
  const settings = await fetchPublicSettings();
  const footer = getFooterSettings(settings);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">Links</p>
        <h1 className="mt-3 text-3xl font-bold text-[var(--text)]">友情链接</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
          这里收录与 Mindustry、开源社区和论坛生态相关的站点。正式友链可在后台「页脚设置」中维护。
        </p>
      </div>

      {footer.friendlyLinks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] px-6 py-12 text-center">
          <p className="text-sm text-[var(--text-secondary)]">暂无友情链接。</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">管理员可以在后台「站点设置 → 页脚设置」添加友链。</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {footer.friendlyLinks.map((link) => {
            const external = isExternalHref(link.href);
            const content = (
              <div className="h-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 transition-colors hover:border-[var(--primary)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="truncate text-base font-semibold text-[var(--text)]">{link.label}</h2>
                  {external && <ExternalLink className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />}
                </div>
                {link.description && (
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{link.description}</p>
                )}
                <p className="mt-4 truncate text-xs text-[var(--text-muted)]">{link.href}</p>
              </div>
            );

            if (external) {
              return (
                <a key={`${link.label}-${link.href}`} href={link.href} target="_blank" rel="noopener noreferrer">
                  {content}
                </a>
              );
            }

            return (
              <Link key={`${link.label}-${link.href}`} href={link.href}>
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDiscoverSummary } from "@/lib/api/v1/discover";
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';
import { siteProfile } from '@/config/site-profile';
import { buildDiscoverNavigation } from '@/lib/navigation/discover-navigation';

export async function generateMetadata() {
  const locale = await getRequestLocale();
  return { title: translate(locale, 'discoverPage.title'), description: translate(locale, 'discoverPage.description') };
}

export default async function DiscoverPage() {
  const locale = await getRequestLocale();
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);
  let summary;
  try {
    summary = await getDiscoverSummary();
  } catch {
    summary = null;
  }
  const entries = buildDiscoverNavigation(siteProfile, (key) => t(key));
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 border-b border-[var(--border)] pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--primary-text)]">
          {siteProfile.branding.siteName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text)]">{t('discoverPage.title')}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {t('discoverPage.intro')}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {entries.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={title}
            href={href}
            className="group flex items-center justify-between border border-[var(--border)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--primary)]"
          >
            <span className="flex items-center gap-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--primary)]/10 text-[var(--primary-text)]">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-semibold text-[var(--text)]">
                  {title}
                </span>
                <span className="mt-1 block text-sm text-[var(--text-secondary)]">
                  {description}
                </span>
              </span>
            </span>
            <ArrowRight className="h-4 w-4 text-[var(--text-muted)] transition group-hover:translate-x-1 group-hover:text-[var(--primary-text)]" />
          </Link>
        ))}
      </div>
      {summary && (
        <p className="mt-8 text-sm text-[var(--text-muted)]">
          {t('discoverPage.summary', { resources: new Intl.NumberFormat(locale).format(summary.total_resources), discussions: new Intl.NumberFormat(locale).format(summary.total_threads) })}
        </p>
      )}
    </div>
  );
}

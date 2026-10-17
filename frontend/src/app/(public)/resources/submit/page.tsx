import ResourceSubmitForm from '@/components/forum/resource-submit-form';
import Link from 'next/link';
import { ClipboardPaste, Map, Puzzle } from 'lucide-react';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

export default async function ResourceSubmitPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, `resourceSubmit.${key}`);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">{t('submit')}</h1>
      <p className="mb-6 text-sm text-[var(--text-muted)]">
        {t('pageDescription')}
      </p>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/resources/submit/mod" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--primary)]/60">
          <Puzzle className="mb-2 h-5 w-5 text-[var(--primary-text)]" />
          <p className="font-medium text-[var(--text)]">{t('modSubmit')}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t('modCardDescription')}</p>
        </Link>
        <Link href="/resources/submit/map" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--primary)]/60">
          <Map className="mb-2 h-5 w-5 text-[var(--primary-text)]" />
          <p className="font-medium text-[var(--text)]">{t('mapSubmit')}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t('mapPageDescription')}</p>
        </Link>
        <Link href="/resources/submit/schematic" className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--primary)]/60">
          <ClipboardPaste className="mb-2 h-5 w-5 text-[var(--primary-text)]" />
          <p className="font-medium text-[var(--text)]">{t('schematicSubmit')}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t('schematicPageDescription')}</p>
        </Link>
      </div>
      <ResourceSubmitForm />
    </div>
  );
}

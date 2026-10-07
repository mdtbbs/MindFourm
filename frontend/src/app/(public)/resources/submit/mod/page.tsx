import Link from 'next/link';
import { ArrowLeft, Puzzle } from 'lucide-react';
import ResourceSubmitForm from '@/components/forum/resource-submit-form';
import { getRequestLocale } from '@/i18n/server';
import { translate } from '@/i18n';

export default async function SubmitModPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, `resourceSubmit.${key}`);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/resources?resource_kind=mod" className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--primary)]">
        <ArrowLeft className="h-4 w-4" />
        {t('backToMods')}
      </Link>
      <div className="mb-6 flex items-start gap-3">
        <Puzzle className="mt-1 h-6 w-6 shrink-0 text-[var(--primary)]" />
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">{t('modSubmit')}</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{t('modPageDescription')}</p>
        </div>
      </div>
      <ResourceSubmitForm initialResourceKind="mod" lockResourceKind />
    </div>
  );
}

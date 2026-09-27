'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Resource } from '@/types';
import ResourceEditForm from '@/components/forum/resource-edit-form';
import { useI18n } from '@/i18n/provider';

export default function ResourceEditPageContent({ resource }: { resource: Resource }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-6">
        <Link href={`/resources/${resource.id}`} className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--primary)]">
          <ArrowLeft className="h-4 w-4" />
          {t('resourceEdit.pageBack')}
        </Link>
      </nav>
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">{t('resourceEdit.pageTitle')}</h1>
      <p className="mb-6 text-sm text-[var(--text-muted)]">{t('resourceEdit.pageDescription')}</p>
      <ResourceEditForm resource={resource} />
    </div>
  );
}

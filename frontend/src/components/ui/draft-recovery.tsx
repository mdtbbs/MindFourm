'use client';

import { useI18n } from '@/i18n/provider';

interface DraftRecoveryProps {
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
  className?: string;
}

function formatDraftTime(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

/** A recovery choice prevents a stale local draft from silently replacing new work. */
export default function DraftRecovery({ savedAt, onRestore, onDiscard, className = '' }: DraftRecoveryProps) {
  const { locale, t } = useI18n();
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900 dark:border-primary-900/60 dark:bg-primary-950/30 dark:text-primary-100 ${className}`} role="status">
      <span>{t('draftRecovery.message', { time: formatDraftTime(savedAt, locale) })}</span>
      <span className="flex gap-2">
        <button type="button" onClick={onDiscard} className="rounded px-2 py-1 text-primary-800 underline underline-offset-2 hover:bg-primary-100 dark:text-primary-200 dark:hover:bg-primary-900/50">
          {t('draftRecovery.discard')}
        </button>
        <button type="button" onClick={onRestore} className="rounded bg-primary-600 px-3 py-1 font-medium text-white hover:bg-primary-700">
          {t('draftRecovery.restore')}
        </button>
      </span>
    </div>
  );
}

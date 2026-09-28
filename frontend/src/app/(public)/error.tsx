/**
 * Public Routes Error Boundary
 *
 * Handles errors in public routes (home, posts, categories, etc.)
 */

'use client';

import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useI18n } from '@/i18n/provider';

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      title={t('errors.pageError')}
      description={t('errors.loadError')}
    />
  );
}

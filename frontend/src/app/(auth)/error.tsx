/**
 * Auth Routes Error Boundary
 *
 * Handles errors in authenticated routes (notifications, messages, settings, etc.)
 */

'use client';

import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useI18n } from '@/i18n/provider';

export default function AuthError({
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

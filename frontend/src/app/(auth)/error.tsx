/**
 * Auth Routes Error Boundary
 *
 * Handles errors in authenticated routes (notifications, messages, settings, etc.)
 */

'use client';

import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      title="页面错误"
      description="该页面加载失败，请刷新页面重试。"
    />
  );
}
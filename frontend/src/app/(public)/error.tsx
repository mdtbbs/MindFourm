/**
 * Public Routes Error Boundary
 *
 * Handles errors in public routes (home, posts, categories, etc.)
 */

'use client';

import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function PublicError({
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
      description="内容加载失败，请刷新页面重试。"
    />
  );
}
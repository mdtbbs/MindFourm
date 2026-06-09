/**
 * Admin Error Boundary
 *
 * Handles errors in the admin panel routes.
 */

'use client';

import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function AdminError({
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
      title="管理面板错误"
      description="管理面板加载失败，请刷新页面或返回首页。"
    />
  );
}
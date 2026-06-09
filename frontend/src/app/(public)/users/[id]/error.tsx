/**
 * User Profile Error Boundary
 *
 * Handles errors when loading user profiles.
 */

'use client';

import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function UserProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Check if it's a 404-type error
  const isNotFound =
    error.message?.toLowerCase().includes('not found') ||
    error.message?.toLowerCase().includes('不存在') ||
    error.message?.toLowerCase().includes('用户');

  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      title={isNotFound ? '用户不存在' : '用户信息加载失败'}
      description={
        isNotFound
          ? '该用户可能不存在或已被删除。'
          : '无法加载用户信息，请刷新页面重试。'
      }
    />
  );
}
/**
 * Post Detail Error Boundary
 *
 * Handles errors when loading individual posts.
 */

'use client';

import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function PostDetailError({
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
    error.message?.toLowerCase().includes('deleted');

  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      title={isNotFound ? '帖子不存在' : '帖子加载失败'}
      description={
        isNotFound
          ? '该帖子可能已被删除或不存在。'
          : '无法加载该帖子，请刷新页面或返回列表。'
      }
    />
  );
}
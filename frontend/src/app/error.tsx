'use client';

import { ErrorBoundary } from '@/components/ui/error-boundary';

/** Route-level fallback for transient API/CDN failures. No backend detail is rendered. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorBoundary
      error={error}
      reset={reset}
      title="页面暂时无法加载"
      description="服务可能正在恢复，稍后重试即可。若问题持续存在，请通过公告页或交流群联系管理员。"
    />
  );
}

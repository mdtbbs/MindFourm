/**
 * ErrorBoundary - Reusable error boundary component
 *
 * Displays a user-friendly error message with a retry button.
 * Used as the base for route-level error.tsx files.
 */

'use client';

import Link from 'next/link';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
}

export function ErrorBoundary({
  error,
  reset,
  title = '出错了',
  description = '页面加载时发生错误，请尝试刷新页面。',
}: ErrorBoundaryProps) {
  return (
    <div className="min-h-[300px] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {/* Error icon */}
        <div className="mb-4">
          <svg
            className="w-16 h-16 mx-auto text-[var(--error)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Error title */}
        <h2 className="text-xl font-semibold text-[var(--text)]">{title}</h2>

        {/* Error description */}
        <p className="text-[var(--text-secondary)] mt-2">{description}</p>

        {/* Error message (if available and not too technical) */}
        {error.message && !error.message.includes('fetch') && (
          <p className="text-[var(--text-muted)] mt-1 text-sm">
            {error.message}
          </p>
        )}

        {/* Retry button */}
        <button
          onClick={reset}
          className="mt-4 px-4 py-2 rounded-lg bg-[var(--primary)] text-white font-medium hover:opacity-90 transition-opacity"
        >
          重试
        </button>

        {/* Home link */}
        <Link
          href="/"
          className="mt-2 block text-[var(--primary)] hover:underline text-sm"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}

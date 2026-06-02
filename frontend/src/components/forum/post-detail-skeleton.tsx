'use client';

import { cn } from '@/lib/utils';

interface PostDetailSkeletonProps {
  className?: string;
}

/**
 * Skeleton placeholder for full post detail page
 * Enhanced with shimmer sweep effect
 */
export function PostDetailSkeleton({ className }: PostDetailSkeletonProps) {
  return (
    <div
      className={cn(
        'max-w-4xl mx-auto py-8 px-4',
        'bg-[var(--bg)]',
        className
      )}
    >
      {/* Main content skeleton */}
      <div
        className={cn(
          'bg-[var(--bg-card)] rounded-lg p-6',
          'border border-[var(--border)]',
          'relative overflow-hidden'
        )}
      >
        {/* Shimmer overlay */}
        <div
          className="absolute inset-0 shimmer-sweep pointer-events-none"
          aria-hidden="true"
        />

        {/* Content */}
        <div className="space-y-6 relative">
          {/* Title */}
          <div className="h-8 bg-[var(--bg-elevated)] rounded w-2/3" />

          {/* Meta row */}
          <div className="flex gap-4">
            <div className="h-4 bg-[var(--bg-elevated)] rounded w-24" />
            <div className="h-4 bg-[var(--bg-elevated)] rounded w-16" />
            <div className="h-4 bg-[var(--bg-elevated)] rounded w-20" />
          </div>

          {/* Content lines */}
          <div className="space-y-2">
            <div className="h-4 bg-[var(--bg-elevated)] rounded w-full" />
            <div className="h-4 bg-[var(--bg-elevated)] rounded w-5/6" />
            <div className="h-4 bg-[var(--bg-elevated)] rounded w-4/6" />
            <div className="h-4 bg-[var(--bg-elevated)] rounded w-3/4" />
            <div className="h-4 bg-[var(--bg-elevated)] rounded w-2/3" />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <div className="h-9 bg-[var(--bg-elevated)] rounded w-20" />
            <div className="h-9 bg-[var(--bg-elevated)] rounded w-16" />
            <div className="h-9 bg-[var(--bg-elevated)] rounded w-24" />
          </div>
        </div>
      </div>

      {/* Replies section */}
      <div className="mt-6">
        {/* Replies header */}
        <div
          className={cn(
            'h-6 bg-[var(--bg-card)] rounded w-32 mb-4',
            'border border-[var(--border)]',
            'relative overflow-hidden px-4 py-2'
          )}
        >
          <div className="absolute inset-0 shimmer-sweep pointer-events-none" aria-hidden="true" />
        </div>

        {/* Reply skeletons */}
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className={cn(
                'bg-[var(--bg-card)] rounded-lg p-4',
                'border border-[var(--border)]',
                'relative overflow-hidden'
              )}
            >
              {/* Shimmer overlay */}
              <div
                className="absolute inset-0 shimmer-sweep pointer-events-none"
                aria-hidden="true"
              />

              {/* Reply content */}
              <div className="space-y-2 relative">
                {/* Author info */}
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-[var(--bg-elevated)] rounded-full" />
                  <div className="h-4 bg-[var(--bg-elevated)] rounded w-24" />
                </div>

                {/* Reply text */}
                <div className="h-4 bg-[var(--bg-elevated)] rounded w-3/4" />
                <div className="h-4 bg-[var(--bg-elevated)] rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
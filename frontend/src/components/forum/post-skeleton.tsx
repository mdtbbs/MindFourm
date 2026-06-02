'use client';

import { cn } from '@/lib/utils';

interface PostSkeletonProps {
  count?: number;
  className?: string;
}

/**
 * Skeleton placeholder for post list items
 * Enhanced with shimmer sweep effect
 */
export function PostSkeleton({ count = 1, className }: PostSkeletonProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
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

          {/* Content skeleton */}
          <div className="space-y-3 relative">
            {/* Title */}
            <div className="h-5 bg-[var(--bg-elevated)] rounded w-3/4" />

            {/* Meta */}
            <div className="h-4 bg-[var(--bg-elevated)] rounded w-1/2" />

            {/* Tags */}
            <div className="flex gap-2">
              <div className="h-5 bg-[var(--bg-elevated)] rounded-full w-16" />
              <div className="h-5 bg-[var(--bg-elevated)] rounded-full w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

interface PostListSkeletonProps {
  count?: number;
  className?: string;
}

/**
 * Skeleton for entire post list page
 */
export function PostListSkeleton({ count = 5, className }: PostListSkeletonProps) {
  return (
    <div className={cn('max-w-4xl mx-auto py-8 px-4', className)}>
      {/* Header skeleton */}
      <div className="h-8 bg-[var(--bg-elevated)] rounded w-48 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 shimmer-sweep pointer-events-none" aria-hidden="true" />
      </div>

      {/* Post items */}
      <PostSkeleton count={count} />
    </div>
  );
}
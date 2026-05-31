'use client';

import { cn } from '@/lib/utils';

interface UserProfileSkeletonProps {
  className?: string;
}

/**
 * Skeleton placeholder for user profile page
 * Enhanced with shimmer sweep effect
 */
export function UserProfileSkeleton({ className }: UserProfileSkeletonProps) {
  return (
    <div className={cn('max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8', className)}>
      {/* UserCard skeleton */}
      <div className="flex justify-center mb-8">
        <div className="bg-[var(--bg-card)] dark:bg-gray-800 rounded-xl p-6 w-[280px] relative overflow-hidden">
          {/* Shimmer overlay */}
          <div className="absolute inset-0 shimmer-sweep pointer-events-none" aria-hidden="true" />

          {/* Avatar */}
          <div className="flex justify-center mb-4 relative">
            <div className="w-24 h-24 rounded-full bg-[var(--bg-elevated)] dark:bg-gray-700" />
          </div>

          {/* Username */}
          <div className="flex justify-center mb-3 relative">
            <div className="h-6 bg-[var(--bg-elevated)] dark:bg-gray-700 rounded w-24" />
          </div>

          {/* Stats */}
          <div className="flex justify-center gap-6 relative">
            <div className="h-4 bg-[var(--bg-elevated)] dark:bg-gray-700 rounded w-12" />
            <div className="h-4 bg-[var(--bg-elevated)] dark:bg-gray-700 rounded w-12" />
            <div className="h-4 bg-[var(--bg-elevated)] dark:bg-gray-700 rounded w-12" />
          </div>
        </div>
      </div>

      {/* Bio skeleton */}
      <div className="max-w-md mx-auto mb-8 relative overflow-hidden">
        <div className="h-4 bg-[var(--bg-elevated)] dark:bg-gray-700 rounded w-3/4 mx-auto shimmer-sweep" />
      </div>

      {/* Role badge and edit link skeleton */}
      <div className="max-w-md mx-auto flex justify-center gap-3 mb-8 relative overflow-hidden">
        <div className="h-6 bg-[var(--bg-elevated)] dark:bg-gray-700 rounded w-16 shimmer-sweep" />
        <div className="h-6 bg-[var(--bg-elevated)] dark:bg-gray-700 rounded w-20 shimmer-sweep" />
      </div>

      {/* Tabs skeleton */}
      <div className="border-b border-[var(--border)] dark:border-gray-700 mb-6 relative overflow-hidden">
        <div className="flex gap-4">
          <div className="h-10 w-16 bg-[var(--bg-elevated)] dark:bg-gray-700 rounded shimmer-sweep" />
          <div className="h-10 w-16 bg-[var(--bg-elevated)] dark:bg-gray-700 rounded shimmer-sweep" />
          <div className="h-10 w-20 bg-[var(--bg-elevated)] dark:bg-gray-700 rounded shimmer-sweep" />
        </div>
      </div>

      {/* Content list skeleton */}
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-[var(--bg-card)] dark:bg-gray-800 rounded-lg p-4 border border-[var(--border)] dark:border-gray-700 relative overflow-hidden"
          >
            {/* Shimmer overlay */}
            <div className="absolute inset-0 shimmer-sweep pointer-events-none" aria-hidden="true" />

            {/* Content */}
            <div className="space-y-3 relative">
              <div className="h-5 bg-[var(--bg-elevated)] dark:bg-gray-700 rounded w-3/4" />
              <div className="h-4 bg-[var(--bg-elevated)] dark:bg-gray-700 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
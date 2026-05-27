import { PostSkeleton } from '@/components/forum/post-skeleton';

export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-8">
        {/* Left Sidebar Skeleton */}
        <div className="hidden lg:block w-64 flex-shrink-0">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-surface-200 dark:bg-gray-700 rounded w-24" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-4 bg-surface-200 dark:bg-gray-700 rounded w-20" />
              ))}
            </div>
            <div className="h-6 bg-surface-200 dark:bg-gray-700 rounded w-24 mt-6" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-5 bg-surface-200 dark:bg-gray-700 rounded-full w-16" />
              ))}
            </div>
          </div>
        </div>

        {/* Main Content Skeleton */}
        <div className="flex-1 space-y-4">
          {/* Server Section Skeleton */}
          <div className="animate-pulse p-4 bg-surface-100 dark:bg-gray-800 rounded-lg">
            <div className="h-5 bg-surface-200 dark:bg-gray-700 rounded w-32 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-32 bg-surface-200 dark:bg-gray-700 rounded-lg" />
              ))}
            </div>
          </div>

          {/* Posts Skeleton */}
          <div className="h-8 bg-surface-200 dark:bg-gray-700 rounded w-32 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 bg-surface-100 dark:bg-gray-800 rounded-lg">
                <PostSkeleton />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

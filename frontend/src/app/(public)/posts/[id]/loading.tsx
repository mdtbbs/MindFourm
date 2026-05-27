export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb Skeleton */}
      <div className="mb-6 animate-pulse">
        <div className="h-4 bg-surface-200 dark:bg-gray-700 rounded w-48" />
      </div>

      {/* Post Content Skeleton */}
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-surface-200 dark:bg-gray-700 rounded w-3/4" />
        <div className="flex gap-4">
          <div className="h-4 bg-surface-200 dark:bg-gray-700 rounded w-24" />
          <div className="h-4 bg-surface-200 dark:bg-gray-700 rounded w-20" />
          <div className="h-4 bg-surface-200 dark:bg-gray-700 rounded w-16" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-4 bg-surface-200 dark:bg-gray-700 rounded w-full" />
          ))}
        </div>
      </div>

      {/* Replies Skeleton */}
      <div className="mt-8 animate-pulse space-y-4">
        <div className="h-6 bg-surface-200 dark:bg-gray-700 rounded w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4 bg-surface-100 dark:bg-gray-800 rounded-lg space-y-2">
            <div className="flex gap-4">
              <div className="h-10 w-10 bg-surface-200 dark:bg-gray-700 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-surface-200 dark:bg-gray-700 rounded w-24" />
                <div className="h-4 bg-surface-200 dark:bg-gray-700 rounded w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
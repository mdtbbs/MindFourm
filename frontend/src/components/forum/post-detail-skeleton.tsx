export function PostDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 bg-surface-200 rounded w-2/3" />
      <div className="flex gap-4 text-sm text-surface-400">
        <div className="h-4 bg-surface-200 rounded w-24" />
        <div className="h-4 bg-surface-200 rounded w-16" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-surface-200 rounded w-full" />
        <div className="h-4 bg-surface-200 rounded w-5/6" />
        <div className="h-4 bg-surface-200 rounded w-4/6" />
      </div>
      <div className="border-t pt-4">
        <div className="h-6 bg-surface-200 rounded w-24 mb-3" />
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-surface-100 rounded p-3">
              <div className="h-4 bg-surface-200 rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

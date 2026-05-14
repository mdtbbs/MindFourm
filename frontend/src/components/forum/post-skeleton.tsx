export function PostSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-5 bg-surface-200 rounded w-3/4" />
      <div className="h-4 bg-surface-200 rounded w-1/2" />
      <div className="flex gap-2">
        <div className="h-5 bg-surface-200 rounded-full w-16" />
        <div className="h-5 bg-surface-200 rounded-full w-16" />
      </div>
    </div>
  );
}

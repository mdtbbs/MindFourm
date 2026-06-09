'use client';

import { cn } from '@/lib/utils';

interface PointsDisplayProps {
  total_points: number;
  available_points: number;
  className?: string;
  showAvailable?: boolean;
}

export function PointsDisplay({ total_points, available_points, className, showAvailable = true }: PointsDisplayProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 2a6 6 0 00-6 6c0 1.887.454 3.665 1.257 5.234a.75.75 0 00.57.408 5.033 5.033 0 002.473.03.75.75 0 01.886.885 5.033 5.033 0 01-.03 2.473.75.75 0 00.408.57A5.978 5.978 0 0010 18a5.978 5.978 0 004.436-1.916.75.75 0 00.408-.57 5.033 5.033 0 01-.03-2.473.75.75 0 01.886-.885 5.033 5.033 0 002.473-.03.75.75 0 00.57-.408A5.978 5.978 0 0018 8a6 6 0 00-6-6z" />
          <path d="M10 4a4 4 0 00-4 4c0 1.432.376 2.776 1.036 3.934a6.518 6.518 0 011.357-.566.75.75 0 01.886.886 6.56 6.56 0 01-.566 1.357A3.993 3.993 0 0010 14a3.993 3.993 0 001.281-.383 6.56 6.56 0 01-.566-1.357.75.75 0 01.886-.886c.473.127.932.313 1.357.566A3.993 3.993 0 0014 8a4 4 0 00-4-4z" />
        </svg>
        <span className="font-semibold text-sm">{total_points}</span>
      </div>
      {showAvailable && (
        <span className="text-xs text-muted-foreground">
          (可用: {available_points})
        </span>
      )}
    </div>
  );
}

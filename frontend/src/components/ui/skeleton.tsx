import { cn } from '@/lib/utils';

type SkeletonProps = {
  className?: string;
};

export default function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('shimmer-sweep rounded-md bg-[var(--bg-elevated)]', className)}
    />
  );
}

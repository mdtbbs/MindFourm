import LoadingSpinner from './loading-spinner';
import { cn } from '@/lib/utils';

type InlineLoadingProps = {
  label?: string;
  className?: string;
};

export default function InlineLoading({ label = '正在加载', className }: InlineLoadingProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn('flex min-h-12 items-center justify-center gap-2 px-3 py-2 text-sm text-[var(--text-secondary)]', className)}
    >
      <LoadingSpinner variant="simple" size="sm" label={label} />
      <span>{label}</span>
    </div>
  );
}

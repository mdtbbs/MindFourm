import type { HomeStats } from '@/lib/api/v1/home';

/**
 * The "community is alive" row. Numbers come from the same aggregate the rest of
 * the page uses, so the strip costs nothing extra and can never contradict the
 * sections below it.
 */
export default function HomeStatsStrip({
  stats,
  labels,
  variant = 'strip',
}: {
  stats: HomeStats | null;
  labels: { posts: string; replies: string; members: string; resources: string; today: string };
  variant?: 'strip' | 'compact';
}) {
  if (!stats) return null;

  const items = [
    { label: labels.posts, value: stats.posts, highlight: false },
    { label: labels.replies, value: stats.replies, highlight: false },
    { label: labels.members, value: stats.members, highlight: false },
    { label: labels.resources, value: stats.resources, highlight: false },
    { label: labels.today, value: stats.today_posts, highlight: true },
  ];

  const gridClass =
    variant === 'compact'
      ? 'grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)]'
      : 'grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-5';

  return (
    <dl className={gridClass}>
      {items.map((item) => (
        <div
          key={item.label}
          className={`relative bg-[var(--bg-card)] ${variant === 'compact' ? 'px-3 py-2.5' : 'px-4 py-3'} ${item.highlight ? 'before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-[var(--industrial-accent)]' : ''} ${variant === 'compact' && item.highlight ? 'col-span-2 flex items-center justify-between' : ''}`}
        >
          <dt className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{item.label}</dt>
          <dd className={`${variant === 'compact' && item.highlight ? '' : 'mt-1'} font-mono ${variant === 'compact' ? 'text-base' : 'text-xl'} font-semibold tabular-nums ${item.highlight ? 'text-[var(--industrial-accent)]' : 'text-[var(--text)]'}`}>
            {item.value.toLocaleString('zh-CN')}
          </dd>
        </div>
      ))}
    </dl>
  );
}

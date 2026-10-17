import type { HomeStats } from '@/lib/api/v1/home';

/**
 * The "community is alive" row. Numbers come from the same aggregate the rest of
 * the page uses, so the strip costs nothing extra and can never contradict the
 * sections below it.
 */
export default function HomeStatsStrip({ stats, labels }: { stats: HomeStats | null; labels: { posts: string; replies: string; members: string; resources: string; today: string } }) {
  if (!stats) return null;

  const items = [
    { label: labels.posts, value: stats.posts },
    { label: labels.replies, value: stats.replies },
    { label: labels.members, value: stats.members },
    { label: labels.resources, value: stats.resources },
    { label: labels.today, value: stats.today_posts },
  ];

  return <dl className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-5">
    {items.map((item) => <div key={item.label} className="bg-[var(--bg-card)] px-4 py-3">
      <dt className="text-xs text-[var(--text-muted)]">{item.label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--text)]">{item.value.toLocaleString('zh-CN')}</dd>
    </div>)}
  </dl>;
}

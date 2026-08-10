/**
 * Portal summary stats component.
 *
 * Renders a small 3-column grid showing total resources, threads, and
 * servers from the V1 Discover API. Intended for inclusion on the
 * homepage or a dedicated portal page.
 *
 * Server component — fetches data at build/request time, so it can be
 * dropped into any page without additional data fetching.
 */

import { getDiscoverSummary } from '@/lib/api/v1/discover';

export default async function PortalStats() {
  let summary;
  try {
    summary = await getDiscoverSummary();
  } catch {
    return null;
  }

  if (!summary) return null;

  return (
    <div className="grid grid-cols-3 gap-4 mb-8">
      <div className="text-center p-4 bg-[var(--bg-card)] rounded-lg border border-[var(--border)]">
        <div className="text-2xl font-bold">{summary.total_resources}</div>
        <div className="text-sm text-[var(--text-muted)]">资源</div>
      </div>
      <div className="text-center p-4 bg-[var(--bg-card)] rounded-lg border border-[var(--border)]">
        <div className="text-2xl font-bold">{summary.total_threads}</div>
        <div className="text-sm text-[var(--text-muted)]">讨论</div>
      </div>
      <div className="text-center p-4 bg-[var(--bg-card)] rounded-lg border border-[var(--border)]">
        <div className="text-2xl font-bold">{summary.total_servers}</div>
        <div className="text-sm text-[var(--text-muted)]">服务器</div>
      </div>
    </div>
  );
}

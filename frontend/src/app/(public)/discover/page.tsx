import type { Metadata } from 'next';
import Link from 'next/link';
import { getDiscoverSummary } from '@/lib/api/v1/discover';

export const metadata: Metadata = {
  title: '发现',
  description: '探索 Mindustry 社区的资源、讨论和服务器',
};

export default async function DiscoverPage() {
  let summary;
  try {
    summary = await getDiscoverSummary();
  } catch {
    summary = null;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold mb-8">发现</h1>

      {summary ? (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Stats */}
          <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-4">社区概览</h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">资源</span>
                <span className="font-semibold">{summary.total_resources}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">讨论</span>
                <span className="font-semibold">{summary.total_threads}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">服务器</span>
                <span className="font-semibold">{summary.total_servers}</span>
              </div>
            </div>
          </div>

          {/* Recent Resources */}
          <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-4">最新资源</h2>
            <ul className="space-y-2">
              {summary.recent_resources.map(r => (
                <li key={r.id}>
                  <Link href={`/resources/${r.id}`} className="text-sm hover:text-[var(--primary)] truncate block">
                    {r.title}
                  </Link>
                </li>
              ))}
              {summary.recent_resources.length === 0 && (
                <li className="text-sm text-[var(--text-muted)]">暂无资源</li>
              )}
            </ul>
          </div>

          {/* Recent Threads */}
          <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-4">最新讨论</h2>
            <ul className="space-y-2">
              {summary.recent_threads.map(t => (
                <li key={t.id}>
                  <Link href={`/posts/${t.id}`} className="text-sm hover:text-[var(--primary)] truncate block">
                    {t.title}
                  </Link>
                </li>
              ))}
              {summary.recent_threads.length === 0 && (
                <li className="text-sm text-[var(--text-muted)]">暂无讨论</li>
              )}
            </ul>
          </div>
        </div>
      ) : (
        <div className="text-[var(--text-muted)]">
          发现服务暂时不可用，请稍后再试。
        </div>
      )}

      {/* Active Servers */}
      {summary && summary.active_servers.length > 0 && (
        <div className="mt-6 bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] mb-4">活跃服务器</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.active_servers.map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded">
                <div>
                  <div className="font-medium text-sm">{s.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">{s.hostname}:{s.port}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

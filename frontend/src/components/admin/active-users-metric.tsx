import type { AdminStats } from '@/types';

type ActivityStats = Pick<AdminStats, 'active_24h' | 'active_24h_complete' | 'active_24h_observed_since'>;

/** Make a newly started observation window explicit before calling it 24-hour activity. */
export default function ActiveUsersMetric({ stats }: { stats: ActivityStats | null }) {
  const started = stats?.active_24h_observed_since ? new Date(stats.active_24h_observed_since) : null;
  const validWindow = typeof stats?.active_24h_complete === 'boolean' && started && Number.isFinite(started.getTime());
  const complete = validWindow && stats?.active_24h_complete;
  const observedSince = validWindow ? started.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : null;
  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex items-center justify-between">
        <dt className="text-surface-500">{complete ? '24 小时活跃用户' : '活跃用户（观察中）'}</dt>
        <dd className="font-mono text-xs text-surface-800">{validWindow ? stats?.active_24h : '—'}</dd>
      </div>
      <p className="mt-1 text-xs text-surface-400">
        {complete ? '按已登录用户去重，多个设备计为一人。' : observedSince
          ? `从 ${observedSince} 起记录，满 24 小时后显示完整窗口。`
          : '正在等待活跃用户统计窗口。'}
      </p>
    </div>
  );
}

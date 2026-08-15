'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api/client';
import type { AdminStats } from '@/types';
import { Settings, FileText, AlertTriangle, Ban, FolderTree, ScrollText, Package, Flag, SearchX } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { StatsGrid } from '@/lib/shared';

const quickLinks = [
  { href: '/admin/settings/basic', label: '站点设置', icon: Settings },
  { href: '/admin/posts', label: '帖子管理', icon: FileText },
  { href: '/admin/content/moderation', label: '内容审核', icon: AlertTriangle },
  { href: '/admin/system/bans', label: '封禁管理', icon: Ban },
  { href: '/admin/categories', label: '分类管理', icon: FolderTree },
  { href: '/admin/logs', label: '操作日志', icon: ScrollText },
];

const chartDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Dashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const statItems = [
    { label: '帖子', value: stats?.total_posts ?? '--' },
    { label: '回复', value: stats?.total_replies ?? '--' },
    { label: '用户', value: stats?.total_users ?? '--' },
    { label: '24小时活跃', value: stats?.active_24h ?? '--' },
    { label: '资源', value: stats?.total_resources ?? '--' },
  ];

  const activity7d = stats?.activity_7d ?? [];
  const maxActivity = Math.max(...activity7d, 1);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><LoadingSpinner variant="orbital" size="lg" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <StatsGrid items={statItems} columns={4} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity chart */}
        <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">7 日活动</h3>
          </div>
          <div className="flex items-end justify-center gap-2 h-36 px-5 py-6">
            {activity7d.map((val, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-5 bg-[var(--primary)] opacity-60 rounded-sm" style={{ height: `${Math.max((val / maxActivity) * 120, 4)}px` }} />
                <span className="text-xs text-[var(--text-muted)] font-mono">{chartDays[i]}</span>
              </div>
            ))}
            {activity7d.length === 0 && <span className="text-[var(--text-muted)]">暂无数据</span>}
          </div>
        </div>

        {/* Quick access */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">快捷入口</h3>
          </div>
          <div>
            {quickLinks.map((link) => (
              <Link key={link.href} href={link.href} className="flex items-center gap-3 px-5 py-3 text-sm text-[var(--text-secondary)] border-b border-[var(--border-light)] dark:border-gray-800 hover:bg-[var(--bg-hover)] dark:hover:bg-gray-800 hover:text-[var(--text)] transition-colors last:border-b-0">
                <link.icon className="w-4 h-4 shrink-0 opacity-50" />
                {link.label}
                <span className="ml-auto text-[var(--text-muted)]">→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><Package className="h-4 w-4" />资源与审核</div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--text-secondary)]">今日发布资源</dt><dd>{stats?.today_resources ?? '--'}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--text-secondary)]">待审核资源</dt><dd>{stats?.pending_resources ?? '--'}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--text-secondary)]">待处理举报</dt><dd>{stats?.pending_reports ?? '--'}</dd></div>
          </dl>
        </section>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><Flag className="h-4 w-4" />处理效率</div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--text-secondary)]">举报平均处理（30 天）</dt><dd>{stats?.average_report_resolution_hours == null ? '暂无数据' : `${stats.average_report_resolution_hours} 小时`}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--text-secondary)]">今日发帖</dt><dd>{stats?.today_posts ?? '--'}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--text-secondary)]">今日回帖</dt><dd>{stats?.today_replies ?? '--'}</dd></div>
          </dl>
        </section>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text)]"><SearchX className="h-4 w-4" />内容发现</div>
          <p className="mb-3 text-sm text-[var(--text-secondary)]">近 7 天无结果搜索：<span className="font-medium text-[var(--text)]">{stats?.zero_result_searches_7d ?? '--'}</span></p>
          <div className="flex flex-wrap gap-2">
            {(stats?.resource_type_breakdown ?? []).map((item) => <span key={item.type} className="rounded bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text-secondary)]">{item.type} · {item.count}</span>)}
            {stats && stats.resource_type_breakdown.length === 0 ? <span className="text-sm text-[var(--text-muted)]">暂无资源数据</span> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

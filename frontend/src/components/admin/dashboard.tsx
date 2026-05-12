'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api/client';
import type { AdminStats } from '@/types';

const quickLinks = [
  { href: '/admin/settings/basic', label: 'Site Settings', icon: '◼' },
  { href: '/admin/posts', label: 'Posts', icon: '▣' },
  { href: '/admin/content/moderation', label: 'Moderation', icon: '△' },
  { href: '/admin/system/bans', label: 'Bans', icon: '⊘' },
  { href: '/admin/categories', label: 'Categories', icon: '▤' },
  { href: '/admin/logs', label: 'Logs', icon: '▦' },
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

  const statCards = [
    { label: 'POSTS', value: stats?.total_posts ?? '--', trend: stats ? `+${stats.today_posts} today` : '' },
    { label: 'REPLIES', value: stats?.total_replies ?? '--', trend: stats ? `+${stats.today_replies} today` : '' },
    { label: 'USERS', value: stats?.total_users ?? '--', trend: stats ? `+${stats.today_users} today` : '' },
    { label: 'ACTIVE 24H', value: stats?.active_24h ?? '--', trend: '' },
  ];

  const maxActivity = stats ? Math.max(...stats.activity_7d, 1) : 1;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-surface-900" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-surface-200 border border-surface-200">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white p-6">
            <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">{card.label}</div>
            <div className="text-3xl font-light text-surface-900">{card.value}</div>
            {card.trend && <div className="text-xs text-surface-400 mt-2">{card.trend}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity chart */}
        <div className="lg:col-span-2 bg-white border border-surface-200">
          <div className="px-5 py-4 border-b border-surface-200">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-600">7-Day Activity</h3>
          </div>
          <div className="flex items-end justify-center gap-2 h-36 px-5 py-6">
            {stats?.activity_7d.map((val, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="w-5 bg-surface-300 rounded-sm" style={{ height: `${Math.max((val / maxActivity) * 120, 4)}px` }} />
                <span className="text-xs text-surface-400 font-mono">{chartDays[i]}</span>
              </div>
            ))}
            {!stats && <span className="text-surface-400">No data</span>}
          </div>
        </div>

        {/* Quick access */}
        <div className="bg-white border border-surface-200">
          <div className="px-5 py-4 border-b border-surface-200">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-600">Quick Access</h3>
          </div>
          <div>
            {quickLinks.map((link) => (
              <Link key={link.href} href={link.href} className="flex items-center gap-3 px-5 py-3 text-sm text-surface-600 border-b border-surface-100 hover:bg-surface-50 hover:text-surface-900 transition-colors last:border-b-0">
                <span className="opacity-50">{link.icon}</span>
                {link.label}
                <span className="ml-auto text-surface-300">→</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

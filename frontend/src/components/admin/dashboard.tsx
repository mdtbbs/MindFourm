'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BellRing,
  Flag,
  Gauge,
  Package,
  RefreshCw,
  SearchX,
  ShieldCheck,
} from 'lucide-react';
import { adminApi, adminNotificationApi } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/context';
import type { AdminLog, AdminStats } from '@/types';
import LoadingSpinner from '@/components/ui/loading-spinner';
import Alert from '@/components/ui/alert';

type PerformanceTelemetry = Awaited<ReturnType<typeof adminApi.getPerformanceTelemetry>>;

interface RateLimitSnapshot {
  total: number;
  hours: Array<{ at: string; blocked: number }>;
  routes: Array<{ route: string; blocked: number }>;
  identities: Record<string, number>;
  ip_sources: Record<string, number>;
}

function formatAction(log: AdminLog): string {
  const target = log.target_type
    ? ` · ${log.target_type}${log.target_id != null ? ` #${log.target_id}` : ''}`
    : '';
  return `${log.action}${target}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [moderationPending, setModerationPending] = useState(0);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [performance, setPerformance] = useState<PerformanceTelemetry | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (soft = false) => {
    soft ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const nextStats = await adminApi.getStats();
      setStats(nextStats);

      const optional = await Promise.allSettled([
        adminApi.getBadgeCounts(),
        adminNotificationApi.unreadCount(),
        adminApi.getLogs({ page: 1, limit: 8 }),
        adminApi.getPerformanceTelemetry(1),
        adminApi.getRateLimitObservability(),
      ]);

      const [badgesResult, unreadResult, logsResult, performanceResult, rateLimitResult] = optional;

      if (badgesResult.status === 'fulfilled') {
        setModerationPending(badgesResult.value.moderation_pending);
      }
      if (unreadResult.status === 'fulfilled') {
        setNotificationUnread(unreadResult.value.count);
      }
      if (logsResult.status === 'fulfilled') {
        setLogs(logsResult.value.data);
      }
      if (performanceResult.status === 'fulfilled') {
        setPerformance(performanceResult.value);
      }
      if (rateLimitResult.status === 'fulfilled') {
        setRateLimit(rateLimitResult.value);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法加载后台概览');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const maxActivity = useMemo(
    () => Math.max(...(stats?.activity_7d ?? []), 1),
    [stats?.activity_7d],
  );

  if (loading && !stats) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <LoadingSpinner variant="orbital" size="lg" />
      </div>
    );
  }

  const queue = [
    {
      label: '内容待审核',
      value: moderationPending,
      href: '/admin/content/moderation?type=all',
      icon: ShieldCheck,
      tone: moderationPending > 0 ? 'text-amber-600' : 'text-surface-500',
    },
    {
      label: '资源待审核',
      value: stats?.pending_resources ?? 0,
      href: '/admin/content/moderation?type=resources',
      icon: Package,
      tone: (stats?.pending_resources ?? 0) > 0 ? 'text-amber-600' : 'text-surface-500',
    },
    {
      label: '待处理举报',
      value: stats?.pending_reports ?? 0,
      href: '/admin/content/reports',
      icon: Flag,
      tone: (stats?.pending_reports ?? 0) > 0 ? 'text-red-600' : 'text-surface-500',
    },
    {
      label: '后台未读',
      value: notificationUnread,
      href: '/admin/notifications',
      icon: BellRing,
      tone: notificationUnread > 0 ? 'text-primary-600' : 'text-surface-500',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-surface-400">Admin 2.0</div>
          <h1 className="mt-1 text-2xl font-semibold text-surface-900">工作台</h1>
          <p className="mt-1 text-sm text-surface-500">先处理需要人介入的事情，再看趋势和运行数据。</p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 hover:bg-surface-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? '刷新中' : '刷新'}
        </button>
      </div>

      {error ? <Alert type="error" message={error} /> : null}

      <section className="admin-v2-panel">
        <div className="admin-v2-panel-header">
          <div>
            <div className="admin-v2-panel-title">需要处理</div>
            <div className="admin-v2-panel-subtitle">只放需要管理员动作的队列，不把累计总数塞进这里。</div>
          </div>
        </div>
        <div className="grid divide-y divide-surface-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          {queue.map((item, index) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex min-h-24 items-center gap-4 px-5 py-4 hover:bg-surface-50 ${index > 1 ? 'sm:border-t sm:border-surface-200 xl:border-t-0' : ''}`}
              >
                <Icon className={`h-5 w-5 ${item.tone}`} />
                <div>
                  <div className="text-2xl font-semibold tabular-nums text-surface-900">{item.value}</div>
                  <div className="mt-1 text-xs text-surface-500">{item.label}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid border border-surface-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['今日社区主题', stats?.today_community_posts ?? 0],
          ['今日回复', stats?.today_replies ?? 0],
          ['今日资源', stats?.today_resources ?? 0],
          ['今日注册', stats?.today_users ?? 0],
        ].map(([label, value], index) => (
          <div
            key={String(label)}
            className={`px-5 py-4 ${index ? 'border-t border-surface-200 sm:border-l sm:border-t-0' : ''} ${index === 2 ? 'sm:border-t lg:border-t-0' : ''}`}
          >
            <div className="text-xs text-surface-500">{label}</div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-surface-900">{value}</div>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="admin-v2-panel">
          <div className="admin-v2-panel-header">
            <div>
              <div className="admin-v2-panel-title">7 日社区活动</div>
              <div className="admin-v2-panel-subtitle">社区主题发布量，保留趋势用途，不做装饰性大图。</div>
            </div>
          </div>
          <div className="flex h-56 items-end gap-3 px-5 pb-5 pt-8">
            {(stats?.activity_7d ?? []).map((value, index) => (
              <div key={index} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[10px] tabular-nums text-surface-400">{value}</span>
                <div className="flex h-36 w-full items-end border-b border-surface-200">
                  <div
                    className="w-full bg-primary-500/70"
                    style={{ height: `${Math.max((value / maxActivity) * 100, 3)}%` }}
                  />
                </div>
                <span className="text-[10px] text-surface-400">
                  {['一', '二', '三', '四', '五', '六', '日'][index] ?? index + 1}
                </span>
              </div>
            ))}
            {(stats?.activity_7d ?? []).length === 0 ? (
              <div className="m-auto text-sm text-surface-400">暂无活动数据</div>
            ) : null}
          </div>
        </section>

        <section className="admin-v2-panel">
          <div className="admin-v2-panel-header">
            <div>
              <div className="admin-v2-panel-title">运行概况</div>
              <div className="admin-v2-panel-subtitle">近 1 小时遥测与风险信号。</div>
            </div>
            <Gauge className="h-4 w-4 text-surface-400" />
          </div>
          <dl className="divide-y divide-surface-100">
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <dt className="text-surface-500">P95 响应</dt>
              <dd className="font-mono text-xs text-surface-800">{performance ? `${performance.estimated_p95_ms} ms` : '—'}</dd>
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <dt className="text-surface-500">慢请求</dt>
              <dd className={`font-mono text-xs ${(performance?.slow_requests ?? 0) > 0 ? 'text-amber-600' : 'text-surface-800'}`}>
                {performance?.slow_requests ?? '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <dt className="text-surface-500">限流拦截</dt>
              <dd className={`font-mono text-xs ${(rateLimit?.total ?? 0) > 0 ? 'text-amber-600' : 'text-surface-800'}`}>
                {rateLimit?.total ?? '—'}
              </dd>
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <dt className="flex items-center gap-2 text-surface-500"><SearchX className="h-3.5 w-3.5" />7 日无结果搜索</dt>
              <dd className="font-mono text-xs text-surface-800">{stats?.zero_result_searches_7d ?? '—'}</dd>
            </div>
          </dl>
          {isAdmin ? (
            <div className="border-t border-surface-200 p-3">
              <Link href="/admin/system/performance" className="text-xs font-medium text-primary-600 hover:underline">
                查看完整性能数据 →
              </Link>
            </div>
          ) : null}
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="admin-v2-panel">
          <div className="admin-v2-panel-header">
            <div>
              <div className="admin-v2-panel-title">资源构成</div>
              <div className="admin-v2-panel-subtitle">当前资源类型分布。</div>
            </div>
            <Package className="h-4 w-4 text-surface-400" />
          </div>
          <div className="divide-y divide-surface-100">
            {(stats?.resource_type_breakdown ?? []).map((item) => (
              <div key={item.type} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-surface-600">{item.type || '未分类'}</span>
                <strong className="font-mono text-xs tabular-nums text-surface-900">{item.count}</strong>
              </div>
            ))}
            {stats && stats.resource_type_breakdown.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-surface-400">暂无资源数据</div>
            ) : null}
          </div>
        </section>

        <section className="admin-v2-panel">
          <div className="admin-v2-panel-header">
            <div>
              <div className="admin-v2-panel-title">最近管理操作</div>
              <div className="admin-v2-panel-subtitle">用于追溯后台最近发生了什么。</div>
            </div>
            <AlertTriangle className="h-4 w-4 text-surface-400" />
          </div>
          <div className="divide-y divide-surface-100">
            {logs.map((log) => (
              <div key={log.id} className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-surface-800">{formatAction(log)}</div>
                  <div className="mt-1 truncate text-[10px] text-surface-400">
                    操作者 #{log.user_id ?? 'system'}{log.details ? ` · ${log.details}` : ''}
                  </div>
                </div>
                <time className="font-mono text-[10px] text-surface-400">
                  {new Date(log.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
            ))}
            {logs.length === 0 ? <div className="px-4 py-8 text-center text-sm text-surface-400">暂无操作记录</div> : null}
          </div>
          {isAdmin ? (
            <div className="border-t border-surface-200 p-3">
              <Link href="/admin/logs" className="text-xs font-medium text-primary-600 hover:underline">
                查看全部日志 →
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

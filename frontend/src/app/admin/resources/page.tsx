'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Activity, Download, Eye, FolderTree, ListChecks, Package, Star } from 'lucide-react';
import { adminApi } from '@/lib/api/client';
import type { AdminStats, Resource } from '@/types';
import ResourceTable from '@/components/admin/resource-table';
import { useI18n } from '@/i18n/provider';

type OperationsSummary = {
  range_days: number;
  generated_at: string;
  totals: {
    by_status: Record<string, number>;
    by_kind: Record<string, number>;
    stale_pending_over_3d: number;
  };
  activity: {
    views: number;
    viewed_resources: number;
    completed_downloads: number;
    downloaded_resources: number;
  };
  featured: Resource[];
  top_viewed: Resource[];
  top_downloaded: Resource[];
};

function unwrap<T>(payload: any): T {
  if (payload && typeof payload === 'object' && payload.success === true && payload.data !== undefined) return payload.data as T;
  return payload as T;
}

async function loadOperations(days: number): Promise<OperationsSummary> {
  const response = await fetch(`/api/admin/resources/operations/summary?days=${days}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || payload?.message || `Request failed: ${response.status}`);
  }
  return unwrap<OperationsSummary>(await response.json());
}

export default function AdminResourcesPage() {
  const { locale } = useI18n();
  const english = locale !== 'zh-CN';
  const searchParams = useSearchParams();
  const initialSearch = searchParams?.get('search') ?? '';
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [operations, setOperations] = useState<OperationsSummary | null>(null);
  const [rangeDays, setRangeDays] = useState(7);
  const [operationsError, setOperationsError] = useState('');

  useEffect(() => {
    adminApi.getStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOperationsError('');
    loadOperations(rangeDays)
      .then((result) => { if (!cancelled) setOperations(result); })
      .catch((cause) => { if (!cancelled) setOperationsError(cause instanceof Error ? cause.message : '运营数据加载失败'); });
    return () => { cancelled = true; };
  }, [rangeDays]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-surface-900">资源管理</h1>
          <p className="mt-1 text-sm text-surface-500">统一查看资源状态、解析结果、审核积压与实际运营表现。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/resources/import" className="inline-flex min-h-11 items-center gap-2 border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
            <Package className="h-4 w-4" />{english ? 'Import resource' : '导入资源'}
          </Link>
          <Link href="/admin/content/moderation?type=resources" className="inline-flex min-h-11 items-center gap-2 border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
            <ListChecks className="h-4 w-4" />审核工作台
          </Link>
          <Link href="/admin/resources/categories" className="inline-flex min-h-11 items-center gap-2 border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 hover:bg-surface-50">
            <FolderTree className="h-4 w-4" />资源分类
          </Link>
        </div>
      </div>

      <section className="grid border border-surface-200 bg-white sm:grid-cols-3">
        <div className="px-5 py-4"><div className="text-xs text-surface-500">资源总量</div><div className="mt-2 text-2xl font-semibold tabular-nums text-surface-900">{stats?.total_resources ?? '—'}</div></div>
        <div className="border-t border-surface-200 px-5 py-4 sm:border-l sm:border-t-0"><div className="text-xs text-surface-500">今日发布</div><div className="mt-2 text-2xl font-semibold tabular-nums text-surface-900">{stats?.today_resources ?? '—'}</div></div>
        <Link href="/admin/content/moderation?type=resources" className="border-t border-surface-200 px-5 py-4 hover:bg-surface-50 sm:border-l sm:border-t-0">
          <div className="flex items-center gap-2 text-xs text-surface-500"><Package className="h-3.5 w-3.5" />待审核</div>
          <div className={`mt-2 text-2xl font-semibold tabular-nums ${(stats?.pending_resources ?? 0) > 0 ? 'text-amber-600' : 'text-surface-900'}`}>{stats?.pending_resources ?? '—'}</div>
        </Link>
      </section>

      <section className="border border-surface-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-200 px-4 py-3">
          <div><h2 className="font-semibold text-surface-900">资源运营</h2><p className="mt-0.5 text-xs text-surface-500">查看真实浏览、完成下载、精选与审核积压。</p></div>
          <select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))} className="min-h-10 border border-surface-300 bg-white px-3 text-sm">
            <option value={1}>24 小时</option><option value={7}>7 天</option><option value={30}>30 天</option><option value={90}>90 天</option>
          </select>
        </div>
        {operationsError ? <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{operationsError}</div> : null}
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<Eye className="h-4 w-4" />} label={`${rangeDays} 天浏览`} value={operations?.activity.views} detail={`${operations?.activity.viewed_resources ?? 0} 个资源`} />
          <Metric icon={<Download className="h-4 w-4" />} label={`${rangeDays} 天完成下载`} value={operations?.activity.completed_downloads} detail={`${operations?.activity.downloaded_resources ?? 0} 个资源`} />
          <Metric icon={<Star className="h-4 w-4" />} label="当前精选" value={operations?.featured.length} detail="可直接在下方资源表调整" />
          <Metric icon={<Activity className="h-4 w-4" />} label="待审超过 3 天" value={operations?.totals.stale_pending_over_3d} detail={(operations?.totals.stale_pending_over_3d ?? 0) > 0 ? '建议优先处理' : '没有积压'} warn={(operations?.totals.stale_pending_over_3d ?? 0) > 0} />
        </div>
        <div className="grid border-t border-surface-200 lg:grid-cols-2">
          <ResourceRanking title="浏览榜" items={operations?.top_viewed || []} metric={(resource) => `${Number(resource.view_count) || 0} 浏览`} />
          <ResourceRanking title="下载榜" items={operations?.top_downloaded || []} metric={(resource) => `${resource.download_count || 0} 下载`} bordered />
        </div>
      </section>

      <ResourceTable initialSearch={initialSearch} />
    </div>
  );
}

function Metric({ icon, label, value, detail, warn = false }: { icon: React.ReactNode; label: string; value?: number; detail: string; warn?: boolean }) {
  return <div className="border-b border-surface-200 px-4 py-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
    <div className="flex items-center gap-2 text-xs text-surface-500">{icon}{label}</div>
    <div className={`mt-2 text-2xl font-semibold tabular-nums ${warn ? 'text-amber-600' : 'text-surface-900'}`}>{value ?? '—'}</div>
    <div className="mt-1 text-xs text-surface-500">{detail}</div>
  </div>;
}

function ResourceRanking({ title, items, metric, bordered = false }: { title: string; items: Resource[]; metric: (resource: Resource) => string; bordered?: boolean }) {
  return <div className={`p-4 ${bordered ? 'border-t border-surface-200 lg:border-l lg:border-t-0' : ''}`}>
    <h3 className="text-sm font-medium text-surface-800">{title}</h3>
    <div className="mt-3 divide-y divide-surface-100">{items.slice(0, 5).map((resource, index) => <Link key={resource.public_id || resource.id} href={`/resources/${encodeURIComponent(resource.public_id || String(resource.id))}`} className="flex min-h-11 items-center gap-3 py-2 hover:bg-surface-50">
      <span className="w-5 text-center font-mono text-xs text-surface-400">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm text-surface-800">{resource.title}</span><span className="shrink-0 text-xs tabular-nums text-surface-500">{metric(resource)}</span>
    </Link>)}{!items.length ? <div className="py-6 text-center text-xs text-surface-400">暂无数据</div> : null}</div>
  </div>;
}

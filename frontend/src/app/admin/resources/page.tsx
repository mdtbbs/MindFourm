'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FolderTree, ListChecks, Package } from 'lucide-react';
import { adminApi } from '@/lib/api/client';
import type { AdminStats } from '@/types';
import ResourceTable from '@/components/admin/resource-table';
import { useI18n } from '@/i18n/provider';

export default function AdminResourcesPage() {
  const { locale } = useI18n();
  const english = locale !== 'zh-CN';
  const searchParams = useSearchParams();
  const initialSearch = searchParams?.get('search') ?? '';
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    adminApi.getStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-surface-900">资源管理</h1>
          <p className="mt-1 text-sm text-surface-500">统一查看资源状态、解析结果和关键运营数据。</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/resources/import"
            className="inline-flex items-center gap-2 border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 hover:bg-surface-50"
          >
            <Package className="h-4 w-4" />
            {english ? 'Import resource' : '导入资源'}
          </Link>
          <Link
            href="/admin/content/moderation?type=resources"
            className="inline-flex items-center gap-2 border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 hover:bg-surface-50"
          >
            <ListChecks className="h-4 w-4" />
            审核工作台
          </Link>
          <Link
            href="/admin/resources/categories"
            className="inline-flex items-center gap-2 border border-surface-200 bg-white px-3 py-2 text-sm text-surface-700 hover:bg-surface-50"
          >
            <FolderTree className="h-4 w-4" />
            资源分类
          </Link>
        </div>
      </div>

      <section className="grid border border-surface-200 bg-white sm:grid-cols-3">
        <div className="px-5 py-4">
          <div className="text-xs text-surface-500">资源总量</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-surface-900">{stats?.total_resources ?? '—'}</div>
        </div>
        <div className="border-t border-surface-200 px-5 py-4 sm:border-l sm:border-t-0">
          <div className="text-xs text-surface-500">今日发布</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-surface-900">{stats?.today_resources ?? '—'}</div>
        </div>
        <Link
          href="/admin/content/moderation?type=resources"
          className="border-t border-surface-200 px-5 py-4 hover:bg-surface-50 sm:border-l sm:border-t-0"
        >
          <div className="flex items-center gap-2 text-xs text-surface-500"><Package className="h-3.5 w-3.5" />待审核</div>
          <div className={`mt-2 text-2xl font-semibold tabular-nums ${(stats?.pending_resources ?? 0) > 0 ? 'text-amber-600' : 'text-surface-900'}`}>
            {stats?.pending_resources ?? '—'}
          </div>
        </Link>
      </section>

      <ResourceTable initialSearch={initialSearch} />
    </div>
  );
}

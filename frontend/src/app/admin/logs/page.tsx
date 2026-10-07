'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/api/client';
import { confirmDialog } from '@/store/interaction-dialog-store';
import { getSettingsRollbackAudit } from '@/lib/admin/settings-audit';
import Badge from '@/components/ui/badge';
import Pagination from '@/components/ui/pagination';
import Button from '@/components/ui/button';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';
type AuditUser = { id: number; username: string; email?: string | null };
type AuditLog = {
  id: number;
  user_id: number | null;
  user?: AuditUser | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};
type AuditSummary = {
  range_days: number;
  total: number;
  top_actions: Array<{ name: string; count: number }>;
  top_targets: Array<{ name: string; count: number }>;
  top_actors: Array<{ user_id: number | null; username: string; count: number }>;
};
type Filters = {
  q: string;
  action_prefix: string;
  target_type: string;
  user_id: string;
  target_id: string;
  request_id: string;
  since: string;
  until: string;
};

const EMPTY_FILTERS: Filters = { q: '', action_prefix: '', target_type: '', user_id: '', target_id: '', request_id: '', since: '', until: '' };

function unwrap<T>(payload: any): T {
  if (payload && typeof payload === 'object' && payload.success === true && payload.data !== undefined) return payload.data as T;
  return payload as T;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || payload?.message || `Request failed: ${response.status}`);
  }
  return unwrap<T>(await response.json());
}

export default function AdminLogsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [rollbackLoadingId, setRollbackLoadingId] = useState<number | null>(null);
  const [rollbackMessage, setRollbackMessage] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [rangeDays, setRangeDays] = useState(7);

  const page = Number(searchParams?.get('page')) || 1;
  const activeFilters = useMemo<Filters>(() => ({
    q: searchParams?.get('q') || '',
    action_prefix: searchParams?.get('action_prefix') || '',
    target_type: searchParams?.get('target_type') || '',
    user_id: searchParams?.get('user_id') || '',
    target_id: searchParams?.get('target_id') || '',
    request_id: searchParams?.get('request_id') || '',
    since: searchParams?.get('since') || '',
    until: searchParams?.get('until') || '',
  }), [searchParams]);
  const [filters, setFilters] = useState<Filters>(activeFilters);

  useEffect(() => setFilters(activeFilters), [activeFilters]);

  useEffect(() => {
    let cancelled = false;
    async function fetchAudit() {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ page: String(page), limit: '50' });
        Object.entries(activeFilters).forEach(([key, value]) => { if (value.trim()) query.set(key, value.trim()); });
        const [list, summaryResult] = await Promise.all([
          getJson<{ data: AuditLog[]; pagination: { totalPages: number } }>(`/api/admin/audit?${query.toString()}`),
          getJson<AuditSummary>(`/api/admin/audit/summary?days=${rangeDays}`),
        ]);
        if (!cancelled) {
          setLogs(list.data || []);
          setTotalPages(list.pagination?.totalPages || 1);
          setSummary(summaryResult);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : '操作审计加载失败');
          setLogs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchAudit();
    return () => { cancelled = true; };
  }, [activeFilters, page, rangeDays, refreshCount]);

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value.trim()) query.set(key, value.trim()); });
    router.push(`${pathname || '/admin/logs'}${query.size ? `?${query.toString()}` : ''}`);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    router.push(pathname || '/admin/logs');
  };

  const rollbackSettings = async (log: AuditLog) => {
    const audit = getSettingsRollbackAudit(log.action, log.details);
    if (!audit || rollbackLoadingId !== null) return;
    const confirmed = await confirmDialog({
      title: '回滚这次设置更改？',
      message: `将恢复“${audit.category}”分类在操作日志 #${log.id} 修改前的值。若设置已再次更改，服务器会拒绝回滚。`,
      confirmLabel: '回滚设置',
      cancelLabel: '取消',
      destructive: true,
    });
    if (!confirmed) return;
    setRollbackLoadingId(log.id);
    setRollbackMessage(null);
    try {
      await adminApi.rollbackSettings(audit.category, log.id);
      setRollbackMessage(`已回滚操作日志 #${log.id} 的设置。`);
      setRefreshCount((count) => count + 1);
    } catch (cause) {
      setRollbackMessage(cause instanceof Error ? cause.message : '设置回滚失败');
    } finally {
      setRollbackLoadingId(null);
    }
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  const getActionBadgeVariant = (action: string): BadgeVariant => {
    const value = action.toLowerCase();
    if (value.includes('delete') || value.includes('remove') || value.includes('reject')) return 'danger';
    if (value.includes('create') || value.includes('add') || value.includes('approve')) return 'success';
    if (value.includes('update') || value.includes('edit') || value.includes('featured')) return 'primary';
    return 'default';
  };

  const parsedDetails = (value: string | null) => {
    if (!value) return null;
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  };

  return <div className="space-y-6">
    <header>
      <h2 className="text-2xl font-bold text-surface-900">操作审计</h2>
      <p className="mt-1 text-sm text-surface-500">跨模块检索管理员与系统操作，可按请求编号串起一次完整操作链。</p>
      {rollbackMessage ? <p className="mt-2 text-sm text-surface-700" role="status">{rollbackMessage}</p> : null}
    </header>

    <section className="border border-surface-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-surface-900">审计概览</h3>
        <select className="min-h-10 border border-surface-300 bg-white px-3 text-sm" value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))}>
          <option value={1}>24 小时</option><option value={7}>7 天</option><option value={30}>30 天</option><option value={90}>90 天</option>
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="border border-surface-200 p-3"><div className="text-xs text-surface-500">操作总数</div><div className="mt-1 text-2xl font-semibold">{summary?.total ?? '—'}</div></div>
        <div className="border border-surface-200 p-3"><div className="text-xs text-surface-500">最高频操作</div><div className="mt-1 truncate font-medium">{summary?.top_actions?.[0]?.name || '—'}</div><div className="text-xs text-surface-500">{summary?.top_actions?.[0]?.count ?? 0} 次</div></div>
        <div className="border border-surface-200 p-3"><div className="text-xs text-surface-500">最高频目标</div><div className="mt-1 truncate font-medium">{summary?.top_targets?.[0]?.name || '—'}</div><div className="text-xs text-surface-500">{summary?.top_targets?.[0]?.count ?? 0} 次</div></div>
        <div className="border border-surface-200 p-3"><div className="text-xs text-surface-500">最活跃操作者</div><div className="mt-1 truncate font-medium">{summary?.top_actors?.[0]?.username || 'system'}</div><div className="text-xs text-surface-500">{summary?.top_actors?.[0]?.count ?? 0} 次</div></div>
      </div>
    </section>

    <form onSubmit={applyFilters} className="border border-surface-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs text-surface-600">全文检索<input className="mt-1 min-h-10 w-full border border-surface-300 px-3 text-sm" value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="操作、目标、详情、用户名" /></label>
        <label className="text-xs text-surface-600">操作前缀<input className="mt-1 min-h-10 w-full border border-surface-300 px-3 text-sm" value={filters.action_prefix} onChange={(event) => setFilters((current) => ({ ...current, action_prefix: event.target.value }))} placeholder="resource. / settings." /></label>
        <label className="text-xs text-surface-600">目标类型<input className="mt-1 min-h-10 w-full border border-surface-300 px-3 text-sm" value={filters.target_type} onChange={(event) => setFilters((current) => ({ ...current, target_type: event.target.value }))} placeholder="resource" /></label>
        <label className="text-xs text-surface-600">请求编号<input className="mt-1 min-h-10 w-full border border-surface-300 px-3 font-mono text-sm" value={filters.request_id} onChange={(event) => setFilters((current) => ({ ...current, request_id: event.target.value }))} placeholder="req_..." /></label>
        <label className="text-xs text-surface-600">用户 ID<input inputMode="numeric" className="mt-1 min-h-10 w-full border border-surface-300 px-3 text-sm" value={filters.user_id} onChange={(event) => setFilters((current) => ({ ...current, user_id: event.target.value }))} /></label>
        <label className="text-xs text-surface-600">目标 ID<input inputMode="numeric" className="mt-1 min-h-10 w-full border border-surface-300 px-3 text-sm" value={filters.target_id} onChange={(event) => setFilters((current) => ({ ...current, target_id: event.target.value }))} /></label>
        <label className="text-xs text-surface-600">开始时间<input type="datetime-local" className="mt-1 min-h-10 w-full border border-surface-300 px-3 text-sm" value={filters.since} onChange={(event) => setFilters((current) => ({ ...current, since: event.target.value }))} /></label>
        <label className="text-xs text-surface-600">结束时间<input type="datetime-local" className="mt-1 min-h-10 w-full border border-surface-300 px-3 text-sm" value={filters.until} onChange={(event) => setFilters((current) => ({ ...current, until: event.target.value }))} /></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2"><Button type="submit">筛选</Button><Button type="button" variant="outline" onClick={clearFilters}>清空</Button></div>
    </form>

    {loading ? <div className="border border-surface-200 bg-white py-12 text-center text-surface-500">加载中...</div> : null}
    {error && !loading ? <div className="border border-red-200 bg-red-50 p-4 text-red-700">{error}</div> : null}

    {!loading && !error ? <section className="border border-surface-200 bg-white">
      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full divide-y divide-surface-200">
          <thead className="bg-surface-50"><tr>{['编号 / 时间', '操作者', '操作', '目标', '请求 / IP', '详情'].map((label) => <th key={label} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-500">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-surface-200">{logs.length ? logs.map((log) => <>
            <tr key={log.id} className="hover:bg-surface-50 align-top">
              <td className="px-4 py-3 text-xs text-surface-600"><div className="font-mono">#{log.id}</div><div className="mt-1 whitespace-nowrap">{formatTime(log.created_at)}</div></td>
              <td className="px-4 py-3 text-sm text-surface-700"><div>{log.user?.username || (log.user_id ? `用户 #${log.user_id}` : 'system')}</div><div className="text-xs text-surface-500">{log.user_id ?? '—'}</div></td>
              <td className="px-4 py-3"><Badge variant={getActionBadgeVariant(log.action)}>{log.action}</Badge></td>
              <td className="px-4 py-3 text-sm text-surface-600"><div>{log.target_type || '—'}</div><div className="font-mono text-xs">{log.target_id ?? '—'}</div></td>
              <td className="px-4 py-3 text-xs text-surface-600"><div className="max-w-48 truncate font-mono">{extractRequestId(log.details) || '—'}</div><div className="mt-1 font-mono">{log.ip_address || '—'}</div></td>
              <td className="px-4 py-3 text-sm"><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setExpanded((current) => current === log.id ? null : log.id)}>{expanded === log.id ? '收起' : '查看'}</Button>{getSettingsRollbackAudit(log.action, log.details) ? <Button type="button" variant="outline" size="sm" disabled={rollbackLoadingId !== null} onClick={() => void rollbackSettings(log)}>{rollbackLoadingId === log.id ? '回滚中…' : '回滚'}</Button> : null}</div></td>
            </tr>
            {expanded === log.id ? <tr key={`${log.id}-detail`}><td colSpan={6} className="bg-surface-50 px-4 py-4"><AuditDetails log={log} details={parsedDetails(log.details)} /></td></tr> : null}
          </>) : <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-surface-500">没有符合条件的审计记录</td></tr>}</tbody>
        </table>
      </div>

      <div className="divide-y divide-surface-200 lg:hidden">{logs.length ? logs.map((log) => <article key={log.id} className="p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-xs text-surface-500">#{log.id} · {formatTime(log.created_at)}</div><div className="mt-1 font-medium text-surface-900">{log.user?.username || (log.user_id ? `用户 #${log.user_id}` : 'system')}</div></div><Badge variant={getActionBadgeVariant(log.action)}>{log.action}</Badge></div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-surface-500">目标</dt><dd>{log.target_type || '—'} {log.target_id ? `#${log.target_id}` : ''}</dd></div><div><dt className="text-surface-500">IP</dt><dd className="font-mono">{log.ip_address || '—'}</dd></div></dl>
        <div className="mt-3 flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setExpanded((current) => current === log.id ? null : log.id)}>{expanded === log.id ? '收起详情' : '查看详情'}</Button>{getSettingsRollbackAudit(log.action, log.details) ? <Button type="button" size="sm" variant="outline" disabled={rollbackLoadingId !== null} onClick={() => void rollbackSettings(log)}>回滚</Button> : null}</div>
        {expanded === log.id ? <div className="mt-3 border-t border-surface-200 pt-3"><AuditDetails log={log} details={parsedDetails(log.details)} /></div> : null}
      </article>) : <div className="p-10 text-center text-sm text-surface-500">没有符合条件的审计记录</div>}</div>
    </section> : null}

    {!loading && !error && logs.length > 0 ? <Pagination currentPage={page} totalPages={totalPages} basePath={pathname ?? '/admin/logs'} queryParams={Object.fromEntries(Object.entries(activeFilters).filter(([, value]) => value))} /> : null}
  </div>;
}

function extractRequestId(details: string | null): string | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details);
    return typeof parsed?.request_id === 'string' ? parsed.request_id : null;
  } catch { return null; }
}

function AuditDetails({ log, details }: { log: AuditLog; details: string | null }) {
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)]">
    <div><div className="mb-1 text-xs font-medium text-surface-500">DETAILS</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all border border-surface-200 bg-white p-3 text-xs text-surface-700">{details || '—'}</pre></div>
    <dl className="space-y-2 text-xs"><div><dt className="text-surface-500">User-Agent</dt><dd className="break-all text-surface-700">{log.user_agent || '—'}</dd></div><div><dt className="text-surface-500">请求编号</dt><dd className="break-all font-mono text-surface-700">{extractRequestId(log.details) || '—'}</dd></div>{log.user?.email ? <div><dt className="text-surface-500">操作者邮箱</dt><dd className="break-all text-surface-700">{log.user.email}</dd></div> : null}</dl>
  </div>;
}

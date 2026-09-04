'use client';

import { useCallback, useEffect, useState } from 'react';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { adminApi } from '@/lib/api/client';

type Telemetry = Awaited<ReturnType<typeof adminApi.getPerformanceTelemetry>>;

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="border border-surface-200 bg-surface-50 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-surface-500">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-surface-900">{value}</p>{hint && <p className="mt-1 text-xs text-surface-500">{hint}</p>}</div>;
}

export default function PerformancePage() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<Telemetry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await adminApi.getPerformanceTelemetry(hours)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法加载性能数据'); }
    finally { setLoading(false); }
  }, [hours]);
  useEffect(() => { void refresh(); }, [refresh]);
  if (loading && !data) return <div className="py-8 text-center text-surface-500">正在加载性能数据…</div>;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-bold text-surface-900">性能监控</h1><p className="mt-1 text-sm text-surface-500">固定功能分组的匿名聚合，不记录 URL 参数、原始 IP 或用户内容。</p></div><div className="flex items-center gap-2"><select value={hours} onChange={(event) => setHours(Number(event.target.value))} className="border border-surface-200 bg-white px-2 py-1.5 text-sm"><option value="1">近 1 小时</option><option value="24">近 24 小时</option><option value="72">近 72 小时</option></select><Button onClick={() => void refresh()} disabled={loading}>{loading ? '刷新中…' : '刷新'}</Button></div></div>
    {error && <Alert type="error" message={error} />}
    {data && <><section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="请求数" value={data.requests} /><Metric label="平均耗时" value={`${data.average_ms} ms`} /><Metric label="P95（估算）" value={`${data.estimated_p95_ms} ms`} hint={`P50 ${data.estimated_p50_ms} ms · P99 ${data.estimated_p99_ms} ms`} /><Metric label="慢请求" value={data.slow_requests} hint="耗时不少于 1 秒" /></section><section className="border border-surface-200 bg-white p-5"><h2 className="font-semibold text-surface-900">耗时分布</h2><div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[['少于 100ms', data.histogram.lt100], ['100–299ms', data.histogram.lt300], ['300–999ms', data.histogram.lt1000], ['1 秒及以上', data.histogram.gte1000]].map(([label, value]) => <div key={String(label)} className="flex justify-between border-b border-surface-100 pb-2"><span className="text-surface-600">{label}</span><strong className="tabular-nums">{value}</strong></div>)}</div></section><section className="border border-surface-200 bg-white p-5"><h2 className="font-semibold text-surface-900">功能分组</h2><p className="mt-1 text-sm text-surface-500">按平均耗时排序；高耗时项用于定位，而非评价单一用户行为。</p><div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-surface-200 text-xs uppercase tracking-wider text-surface-500"><tr><th className="pb-2 pr-4">分组</th><th className="pb-2 pr-4">请求</th><th className="pb-2 pr-4">平均</th><th className="pb-2 pr-4">最大</th><th className="pb-2">慢请求</th></tr></thead><tbody>{data.routes.length ? data.routes.map((route) => <tr key={route.route} className="border-b border-surface-100"><td className="py-2 pr-4 font-mono text-xs">{route.route}</td><td className="py-2 pr-4 tabular-nums">{route.requests}</td><td className="py-2 pr-4 tabular-nums">{route.average_ms} ms</td><td className="py-2 pr-4 tabular-nums">{route.max_ms} ms</td><td className="py-2 tabular-nums">{route.slow_requests}</td></tr>) : <tr><td colSpan={5} className="py-6 text-center text-surface-500">当前窗口还没有可展示的数据。</td></tr>}</tbody></table></div></section></>}
  </div>;
}

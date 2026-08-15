'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

const groups = [
  { title: '发帖频率', fields: [{ key: 'rate_post_max', label: '最大帖子数' }, { key: 'rate_post_window_min', label: '时间窗口（分钟）' }] },
  { title: '回复频率', fields: [{ key: 'rate_reply_max', label: '最大回复数' }, { key: 'rate_reply_window_min', label: '时间窗口（分钟）' }, { key: 'rate_reply_newuser_cooldown_sec', label: '新用户冷却（秒）' }] },
  { title: '登录尝试', fields: [{ key: 'rate_login_max', label: '最大尝试次数' }, { key: 'rate_login_lock_min', label: '锁定时间（分钟）' }] },
  { title: 'API 请求', fields: [{ key: 'rate_api_max', label: '每分钟请求数' }] },
];

export default function RateLimitsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<{
    total: number;
    hours: Array<{ at: string; blocked: number }>;
    routes: Array<{ route: string; blocked: number }>;
    identities: Record<string, number>;
    ip_sources: Record<string, number>;
  } | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const [settings, metrics] = await Promise.all([
        adminApi.getSettings('rate_limit'),
        adminApi.getRateLimitObservability(),
      ]);
      setValues(settings);
      setTelemetry(metrics);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try { await adminApi.updateSettings('rate_limit', values); setMessage('Saved'); setTimeout(() => setMessage(null), 3000); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const update = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-surface-900">限流设置</h1>
        <p className="text-sm text-surface-500 mt-1">通过控制操作频率防止滥用</p>
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error} />}

      <section className="border border-surface-200 bg-surface-50 p-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="font-semibold text-surface-900">过去 24 小时限流命中</h2>
            <p className="mt-1 text-sm text-surface-500">仅汇总路由和可信 CDN 地址来源；不会显示原始 IP。</p>
          </div>
          <strong className="text-2xl tabular-nums text-surface-900">{telemetry?.total ?? '—'}</strong>
        </div>
        {telemetry && (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">高频路由</h3>
              <ul className="mt-2 space-y-1 text-sm text-surface-700">
                {telemetry.routes.length ? telemetry.routes.map((item) => <li key={item.route} className="flex justify-between gap-3"><code className="truncate">{item.route}</code><span>{item.blocked}</span></li>) : <li>暂无命中</li>}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">限流身份</h3>
              <ul className="mt-2 space-y-1 text-sm text-surface-700">
                {Object.entries(telemetry.identities).length ? Object.entries(telemetry.identities).map(([key, value]) => <li key={key} className="flex justify-between"><span>{key}</span><span>{value}</span></li>) : <li>暂无命中</li>}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500">客户端地址来源</h3>
              <ul className="mt-2 space-y-1 text-sm text-surface-700">
                {Object.entries(telemetry.ip_sources).length ? Object.entries(telemetry.ip_sources).map(([key, value]) => <li key={key} className="flex justify-between"><span>{key}</span><span>{value}</span></li>) : <li>暂无命中</li>}
              </ul>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {groups.map((group) => (
          <div key={group.title} className="bg-surface-50 border border-surface-200 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-500 mb-4">{group.title}</h3>
            <div className="space-y-3">
              {group.fields.map((f) => (
                <div key={f.key} className="flex justify-between items-center">
                  <span className="text-sm text-surface-600">{f.label}</span>
                  <input type="number" className="w-20 px-2 py-1 border border-surface-200 rounded text-sm text-center font-mono focus:outline-none focus:border-surface-400" value={values[f.key] ?? ''} onChange={(e) => update(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save All'}</Button>
      </div>
    </div>
  );
}

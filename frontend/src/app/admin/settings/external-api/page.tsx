'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

const AVAILABLE_SCOPES = [
  'posts:read',
  'posts:write',
  'posts:delete',
  'posts:moderate',
  'replies:read',
  'replies:write',
  'replies:delete',
  'resources:read',
  'resources:write',
  'resources:delete',
  'resources:moderate',
  'users:read',
  'users:impersonate',
  'users:bypass_phone_verification',
  'images:write',
  'categories:read',
  'tags:read',
  'audit:read',
  // LanLink / BackupSave integration scopes
  'lanlink:auth',
  'backupsave:auth',
  'friends:read',
  'presence:read',
  'presence:write',
  'notifications:write',
  'admin:*',
] as const;

type ExternalApiKeyView = {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string[];
  allowed_ips: string[];
  default_user_id: number | null;
  rate_limit_per_minute: number;
  enabled: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

type AuditLog = {
  id: number;
  api_key_name: string | null;
  action: string;
  scope: string | null;
  actor_user_id: number | null;
  target_type: string | null;
  target_id: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

type FormState = {
  name: string;
  scopes: string[];
  allowed_ips: string;
  default_user_id: string;
  rate_limit_per_minute: string;
  expires_at: string;
};

const DEFAULT_FORM: FormState = {
  name: '',
  scopes: ['posts:read', 'posts:write', 'replies:write', 'users:impersonate'],
  allowed_ips: '',
  default_user_id: '',
  rate_limit_per_minute: '120',
  expires_at: '',
};

function parseLineList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ExternalApiSettingsPage() {
  const [keys, setKeys] = useState<ExternalApiKeyView[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [keysRes, logsRes] = await Promise.all([
        adminApi.listExternalApiKeys({ page: 1, limit: 50 }),
        adminApi.listExternalApiAuditLogs({ page: 1, limit: 20 }),
      ]);
      setKeys(keysRes.items || []);
      setAuditLogs(logsRes.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载外部 API 配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedScopeSet = useMemo(() => new Set(form.scopes), [form.scopes]);

  const toggleScope = (scope: string) => {
    setForm((prev) => ({
      ...prev,
      scopes: selectedScopeSet.has(scope)
        ? prev.scopes.filter((item) => item !== scope)
        : [...prev.scopes, scope],
    }));
  };

  const createKey = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    setNewSecret(null);
    try {
      const result = await adminApi.createExternalApiKey({
        name: form.name,
        scopes: form.scopes,
        allowed_ips: parseLineList(form.allowed_ips),
        default_user_id: form.default_user_id ? Number(form.default_user_id) : undefined,
        rate_limit_per_minute: Number(form.rate_limit_per_minute || 120),
        expires_at: form.expires_at || undefined,
      });
      setNewSecret(result.plain_key);
      setMessage('API Key 已创建。明文只显示这一次，请立即复制保存。');
      setForm(DEFAULT_FORM);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建 API Key 失败');
    } finally {
      setSaving(false);
    }
  };

  const setEnabled = async (id: number, enabled: boolean) => {
    try {
      if (enabled) {
        await adminApi.enableExternalApiKey(id);
      } else {
        await adminApi.disableExternalApiKey(id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新 API Key 状态失败');
    }
  };

  const rotate = async (id: number) => {
    if (!window.confirm('轮换后旧密钥会立即失效，确定继续吗？')) return;
    try {
      const result = await adminApi.rotateExternalApiKey(id);
      setNewSecret(result.plain_key);
      setMessage('API Key 已轮换。新明文只显示这一次，请立即复制保存。');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '轮换 API Key 失败');
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-surface-500">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="border border-surface-200 bg-white">
        <div className="border-b border-surface-200 px-6 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">外部 API</h2>
          <p className="mt-1 text-xs text-surface-400">
            为机器人或第三方服务创建可限权的 API Key。支持指定用户代发，所有写操作都会进入审计日志。
          </p>
        </div>

        <div className="space-y-5 p-6">
          {message ? <Alert type="success" message={message} /> : null}
          {error ? <Alert type="error" message={error} /> : null}
          {newSecret ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="font-semibold">请立即复制 API Key 明文：</div>
              <code className="mt-2 block break-all rounded bg-white px-3 py-2 font-mono text-xs">{newSecret}</code>
              <p className="mt-2 text-xs">离开此页面后无法再次查看，只能轮换生成新密钥。</p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-surface-700">
              <span className="mb-2 block">名称</span>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm"
                placeholder="审核机器人 / QQ Bot"
              />
            </label>

            <label className="block text-sm text-surface-700">
              <span className="mb-2 block">默认用户 ID（可选）</span>
              <input
                type="number"
                value={form.default_user_id}
                onChange={(e) => setForm((prev) => ({ ...prev, default_user_id: e.target.value }))}
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm"
                placeholder="不填则每次请求必须指定用户"
              />
            </label>

            <label className="block text-sm text-surface-700">
              <span className="mb-2 block">每分钟限流</span>
              <input
                type="number"
                value={form.rate_limit_per_minute}
                onChange={(e) => setForm((prev) => ({ ...prev, rate_limit_per_minute: e.target.value }))}
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-sm text-surface-700">
              <span className="mb-2 block">过期时间（可选）</span>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm((prev) => ({ ...prev, expires_at: e.target.value }))}
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-sm text-surface-700 md:col-span-2">
              <span className="mb-2 block">IP 白名单（可选，一行一个 IP 或 CIDR）</span>
              <textarea
                value={form.allowed_ips}
                onChange={(e) => setForm((prev) => ({ ...prev, allowed_ips: e.target.value }))}
                className="min-h-[90px] w-full border border-surface-200 bg-white px-3 py-2 font-mono text-sm"
                placeholder="203.0.113.10&#10;203.0.113.0/24"
              />
            </label>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-surface-700">Scopes</div>
            <div className="grid gap-2 md:grid-cols-3">
              {AVAILABLE_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 rounded border border-surface-200 px-3 py-2 text-xs text-surface-700">
                  <input
                    type="checkbox"
                    checked={selectedScopeSet.has(scope)}
                    onChange={() => toggleScope(scope)}
                    className="h-4 w-4 accent-surface-900"
                  />
                  <span className={scope === 'admin:*' ? 'font-semibold text-red-600' : ''}>{scope}</span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={createKey} disabled={saving || !form.name || form.scopes.length === 0}>
            {saving ? '创建中...' : '创建 API Key'}
          </Button>
        </div>
      </section>

      <section className="border border-surface-200 bg-white">
        <div className="border-b border-surface-200 px-6 py-4">
          <h3 className="text-sm font-semibold text-surface-800">已有 API Key</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-50 text-left text-xs uppercase tracking-wider text-surface-500">
              <tr>
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">前缀</th>
                <th className="px-4 py-3">Scopes</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">最近使用</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {keys.map((key) => (
                <tr key={key.id}>
                  <td className="px-4 py-3 font-medium text-surface-800">{key.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-surface-500">{key.key_prefix}</td>
                  <td className="px-4 py-3 text-xs text-surface-600">{key.scopes.join(', ')}</td>
                  <td className="px-4 py-3">{key.enabled ? '启用' : '停用'}</td>
                  <td className="px-4 py-3 text-xs text-surface-500">
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleString('zh-CN') : '从未使用'}
                  </td>
                  <td className="space-x-2 px-4 py-3">
                    <button className="text-xs text-primary-600 underline" onClick={() => setEnabled(key.id, !key.enabled)}>
                      {key.enabled ? '停用' : '启用'}
                    </button>
                    <button className="text-xs text-primary-600 underline" onClick={() => rotate(key.id)}>轮换</button>
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr><td className="px-4 py-8 text-center text-surface-400" colSpan={6}>暂无 API Key</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-surface-200 bg-white">
        <div className="border-b border-surface-200 px-6 py-4">
          <h3 className="text-sm font-semibold text-surface-800">最近审计日志</h3>
        </div>
        <div className="divide-y divide-surface-100">
          {auditLogs.map((log) => (
            <div key={log.id} className="grid gap-2 px-6 py-3 text-sm md:grid-cols-[1fr_auto]">
              <div>
                <div className="font-medium text-surface-800">{log.action}</div>
                <div className="text-xs text-surface-500">
                  {log.api_key_name || '未知 Key'} · actor #{log.actor_user_id ?? '-'} · {log.target_type || '-'} #{log.target_id ?? '-'}
                </div>
                {log.error_message ? <div className="mt-1 text-xs text-red-600">{log.error_message}</div> : null}
              </div>
              <div className="text-right text-xs text-surface-500">
                <div>{log.status}</div>
                <div>{new Date(log.created_at).toLocaleString('zh-CN')}</div>
              </div>
            </div>
          ))}
          {auditLogs.length === 0 && <div className="px-6 py-8 text-center text-surface-400">暂无审计日志</div>}
        </div>
      </section>
    </div>
  );
}

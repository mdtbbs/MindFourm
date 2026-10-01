'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

const MIB = 1024 * 1024;

export default function CloudSavesSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setError(null);
    try { setValues(await adminApi.getSettings('cloud-saves')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '加载云存档配置失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchSettings(); }, [fetchSettings]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateSettings('cloud-saves', values);
      setMessage('云存档配置已保存');
      setTimeout(() => setMessage(null), 3000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存云存档配置失败'); }
    finally { setSaving(false); }
  };

  const update = (key: string, value: string) => setValues(previous => ({ ...previous, [key]: value }));
  const bytesValue = (key: string, fallback: number) => {
    const bytes = Number(values[key] || fallback);
    return Number.isFinite(bytes) ? String(Math.round(bytes / MIB * 100) / 100) : '';
  };
  const updateMiB = (key: string, value: string) => {
    const mib = Number(value);
    update(key, Number.isFinite(mib) && mib > 0 ? String(Math.round(mib * MIB)) : '');
  };

  if (loading) return <div className="py-8 text-center text-surface-500">正在加载…</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">云存档设置</h2>
        <p className="mt-1 text-xs text-surface-500">存档文件保存在论坛服务器的本地持久化目录中，不使用对象存储。</p>
      </div>

      <div className="space-y-6 p-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <label className="flex items-start gap-3 rounded border border-surface-200 bg-surface-50 p-4">
          <input
            type="checkbox"
            checked={(values.cloud_saves_enabled ?? 'false') === 'true'}
            onChange={event => update('cloud_saves_enabled', event.target.checked ? 'true' : 'false')}
          />
          <span>
            <span className="block text-sm font-semibold text-surface-800">启用云存档</span>
            <span className="mt-1 block text-xs text-surface-500">启用后，拥有对应 MindAuth scope 的客户端可以管理和传输账号自己的存档。</span>
          </span>
        </label>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-surface-600">服务器存储目录</label>
          <input
            className="w-full rounded border border-surface-200 px-3 py-2 font-mono text-sm focus:border-surface-400 focus:outline-none"
            value={values.cloud_saves_storage_path ?? ''}
            onChange={event => update('cloud_saves_storage_path', event.target.value)}
            placeholder="/var/lib/mindfourm/cloud-saves"
          />
          <p className="mt-2 text-xs leading-5 text-surface-500">填写服务器上的绝对路径；运行论坛的系统用户必须可写，且该目录需要位于持久化磁盘。已有存档后不能直接换目录，需先停用并迁移文件。</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-surface-600">每用户空间额度（MiB）</label>
            <input
              type="number" min="1" step="1"
              className="w-full rounded border border-surface-200 px-3 py-2 text-sm focus:border-surface-400 focus:outline-none"
              value={bytesValue('cloud_saves_user_quota_bytes', 524288000)}
              onChange={event => updateMiB('cloud_saves_user_quota_bytes', event.target.value)}
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-surface-600">单个存档最大容量（MiB）</label>
            <input
              type="number" min="1" step="1"
              className="w-full rounded border border-surface-200 px-3 py-2 text-sm focus:border-surface-400 focus:outline-none"
              value={bytesValue('cloud_saves_max_file_bytes', 52428800)}
              onChange={event => updateMiB('cloud_saves_max_file_bytes', event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-surface-200 px-6 py-4">
        <Button variant="ghost" onClick={() => void fetchSettings()}>重置</Button>
        <Button onClick={() => void save()} disabled={saving}>{saving ? '保存中…' : '保存配置'}</Button>
      </div>
    </div>
  );
}

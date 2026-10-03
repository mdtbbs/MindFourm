'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import SettingsUnsavedChangesBar from '@/components/admin/settings-unsaved-changes-bar';

const MIB = 1024 * 1024;

export default function CloudSavesSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const unsaved = useUnsavedChanges(values);
  const initializeUnsaved = unsaved.initialize;

  const fetchSettings = useCallback(async () => {
    try {
      const data = await adminApi.getSettings('cloud-saves');
      setValues(data);
      initializeUnsaved(data);
    }
    catch (cause) { setLoadError(cause instanceof Error ? cause.message : '加载云存档配置失败'); }
    finally { setLoading(false); }
  }, [initializeUnsaved]);

  useEffect(() => { void fetchSettings(); }, [fetchSettings]);

  const save = async () => {
    if (!unsaved.isDirty || unsaved.isSaving) return;
    const submittedValues = { ...values };
    unsaved.setSaving();
    try {
      await adminApi.updateSettings('cloud-saves', submittedValues);
      unsaved.markSaved(submittedValues);
    } catch (cause) { unsaved.setError(cause instanceof Error ? cause.message : '保存云存档配置失败'); }
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
    <div className={`bg-white border border-surface-200 ${unsaved.isDirty || unsaved.isSaving || unsaved.isSaved || unsaved.error ? 'pb-24' : ''}`}>
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">云存档设置</h2>
        <p className="mt-1 text-xs text-surface-500">存档文件保存在论坛服务器的本地持久化目录中，不使用对象存储。</p>
      </div>

      <div className="space-y-6 p-6">
        {loadError && <Alert type="error" message={loadError} />}

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

      <SettingsUnsavedChangesBar
        dirty={unsaved.isDirty}
        saving={unsaved.isSaving}
        saved={unsaved.isSaved}
        error={unsaved.error}
        onDiscard={() => {
          const restored = unsaved.discard();
          if (restored) setValues(restored);
          setLoadError(null);
        }}
        onSave={() => { void save(); }}
      />
    </div>
  );
}

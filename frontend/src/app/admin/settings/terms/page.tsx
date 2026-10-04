'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import SettingsUnsavedChangesBar from '@/components/admin/settings-unsaved-changes-bar';

export default function TermsSettingsPage() {
  const refreshAfterSettingsSave = useSettingsSaveRefresh();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const unsaved = useUnsavedChanges(values);
  const initializeUnsaved = unsaved.initialize;

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getSettings('terms');
      setValues(data);
      initializeUnsaved(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载条款设置失败');
    } finally {
      setLoading(false);
    }
  }, [initializeUnsaved]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const update = (key: string, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  };

  const handleSave = async () => {
    if (!unsaved.isDirty || unsaved.isSaving) return;
    const submittedValues = { ...values };
    unsaved.setSaving();
    try {
      await adminApi.updateSettings('terms', submittedValues);
      await refreshAfterSettingsSave();
      unsaved.markSaved(submittedValues);
    } catch (err) {
      unsaved.setError(err instanceof Error ? err.message : '保存条款设置失败');
    }
  };

  const required = values.terms_required === 'true';

  if (loading) return <div className="py-8 text-center text-surface-500">加载中…</div>;

  return (
    <div className={`bg-white border border-surface-200 ${unsaved.isDirty || unsaved.isSaving || unsaved.isSaved || unsaved.error ? 'pb-24' : ''}`}>
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">条款设置</h2>
        <p className="text-xs text-surface-400 mt-1">控制登录时的服务条款与隐私政策同意流程。</p>
      </div>
      <div className="p-6 space-y-5">
        {loadError && <Alert type="error" message={loadError} />}

        <label className="flex items-start gap-3 border border-surface-200 p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={required}
            onChange={(event) => update('terms_required', event.target.checked ? 'true' : 'false')}
            className="mt-1 h-4 w-4"
          />
          <span>
            <span className="block text-sm font-medium text-surface-800">启用登录条款确认</span>
            <span className="block mt-1 text-xs text-surface-500">
              开启后，新用户或条款版本更新后的用户必须同意服务条款和隐私政策才能进入论坛。
            </span>
          </span>
        </label>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1" htmlFor="terms-updated-at">
            当前条款版本时间
          </label>
          <div className="flex gap-2">
            <input
              id="terms-updated-at"
              type="datetime-local"
              value={values.terms_updated_at ? new Date(values.terms_updated_at).toISOString().slice(0, 16) : ''}
              onChange={(event) => update('terms_updated_at', new Date(event.target.value).toISOString())}
              className="flex-1 border border-surface-200 rounded px-3 py-2 text-sm"
            />
            <Button
              variant="ghost"
              onClick={() => update('terms_updated_at', new Date().toISOString())}
            >
              更新为现在
            </Button>
          </div>
          <p className="text-xs text-surface-400 mt-1">更新后，早于此时间同意过的用户需要重新确认。</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-surface-700 mb-1" htmlFor="terms-summary">
            确认页摘要
          </label>
          <textarea
            id="terms-summary"
            value={values.terms_summary ?? ''}
            onChange={(event) => update('terms_summary', event.target.value)}
            rows={3}
            className="w-full border border-surface-200 rounded px-3 py-2 text-sm"
            placeholder="使用本站前请阅读并同意我们的服务条款与隐私政策。"
          />
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
        onSave={() => { void handleSave(); }}
      />
    </div>
  );
}

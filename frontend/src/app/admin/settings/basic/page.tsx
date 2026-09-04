'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

export default function BasicSettingsPage() {
  const refreshAfterSettingsSave = useSettingsSaveRefresh();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await adminApi.getSettings('basic');
      setValues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateSettings('basic', values);
      await refreshAfterSettingsSave();
      setMessage('Settings saved successfully');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, val: string) => setValues((prev) => ({ ...prev, [key]: val }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">基础设置</h2>
        <p className="text-xs text-surface-400 mt-1">页脚信息和全站品牌色</p>
      </div>
      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">页脚版权信息</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.site_footer ?? ''} onChange={(e) => update('site_footer', e.target.value)} />
        </div>

        <div className="rounded-lg border border-surface-200 bg-surface-50 p-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-700 mb-2">资源文件存储目录</label>
          <input
            className="w-full px-3 py-2 border border-surface-200 rounded text-sm font-mono focus:outline-none focus:border-surface-400"
            value={values.resource_upload_directory ?? 'resources'}
            onChange={(e) => update('resource_upload_directory', e.target.value)}
            placeholder="resources 或 D:\\data\\mindforum-resources"
          />
          <p className="mt-2 text-xs leading-5 text-surface-500">新上传的资源和版本会保存在这里。相对路径位于服务器的 RESOURCE_UPLOAD_ROOT 下；生产环境建议填写挂载的数据卷绝对路径。</p>
        </div>

        <div className="border-t border-surface-200 pt-6">
          <h3 className="text-sm font-semibold text-surface-800">全站品牌色</h3>
          <p className="mt-1 text-xs text-surface-400">
            影响顶部导航、按钮、选中态和全站品牌强调色。需要填写 6 位十六进制颜色。
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">主品牌色</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 border border-surface-200 bg-white p-1"
                value={values.brand_primary ?? '#2f80ed'}
                onChange={(e) => update('brand_primary', e.target.value)}
              />
              <input
                className="w-36 px-3 py-2 border border-surface-200 rounded text-sm font-mono focus:outline-none focus:border-surface-400"
                value={values.brand_primary ?? '#2f80ed'}
                onChange={(e) => update('brand_primary', e.target.value)}
              />
            </div>
            <p className="text-xs text-surface-400 mt-1">例如：#2f80ed</p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">辅助背景色</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 border border-surface-200 bg-white p-1"
                value={values.brand_accent ?? '#dcecff'}
                onChange={(e) => update('brand_accent', e.target.value)}
              />
              <input
                className="w-36 px-3 py-2 border border-surface-200 rounded text-sm font-mono focus:outline-none focus:border-surface-400"
                value={values.brand_accent ?? '#dcecff'}
                onChange={(e) => update('brand_accent', e.target.value)}
              />
            </div>
            <p className="text-xs text-surface-400 mt-1">用于较浅的强调背景和柔和色块</p>
          </div>
        </div>

        <div className="border border-surface-200 bg-surface-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-surface-600">预览</div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center rounded px-3 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: values.brand_primary || '#2f80ed' }}
            >
              主按钮
            </div>
            <div
              className="inline-flex items-center rounded border px-3 py-2 text-sm"
              style={{
                borderColor: values.brand_primary || '#2f80ed',
                color: values.brand_primary || '#2f80ed',
                backgroundColor: values.brand_accent || '#dcecff',
              }}
            >
              导航 / 选中态
            </div>
          </div>
        </div>
      </div>
      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}

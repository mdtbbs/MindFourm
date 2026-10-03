'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import SettingsUnsavedChangesBar from '@/components/admin/settings-unsaved-changes-bar';

export default function SeoSettingsPage() {
  const refreshAfterSettingsSave = useSettingsSaveRefresh();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const unsaved = useUnsavedChanges(values);
  const initializeUnsaved = unsaved.initialize;

  const fetchSettings = useCallback(async () => {
    try {
      const data = await adminApi.getSettings('seo');
      setValues(data);
      initializeUnsaved(data);
    }
    catch (err) { setLoadError(err instanceof Error ? err.message : 'Failed'); }
    finally { setLoading(false); }
  }, [initializeUnsaved]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    if (!unsaved.isDirty || unsaved.isSaving) return;
    const submittedValues = { ...values };
    unsaved.setSaving();
    try {
      await adminApi.updateSettings('seo', submittedValues);
      await refreshAfterSettingsSave();
      unsaved.markSaved(submittedValues);
    }
    catch (err) { unsaved.setError(err instanceof Error ? err.message : 'Failed'); }
  };

  const update = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  if (loading) return <div className="py-8 text-center text-surface-500">Loading...</div>;

  return (
    <div className={`bg-white border border-surface-200 ${unsaved.isDirty || unsaved.isSaving || unsaved.isSaved || unsaved.error ? 'pb-24' : ''}`}>
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">SEO 设置</h2>
        <p className="text-xs text-surface-400 mt-1">优化搜索引擎索引</p>
      </div>
      <div className="p-6 space-y-6">
        {loadError && <Alert type="error" message={loadError} />}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">标题后缀</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.seo_title_suffix ?? ''} onChange={(e) => update('seo_title_suffix', e.target.value)} />
          <p className="text-xs text-surface-400 mt-1">追加到页面标题，如"帖子标题 | MindForum"</p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">默认描述</label>
          <textarea className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400 min-h-[60px]" value={values.seo_default_description ?? ''} onChange={(e) => update('seo_default_description', e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">OG 图片地址</label>
          <input className="w-full px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400" value={values.seo_og_image ?? ''} onChange={(e) => update('seo_og_image', e.target.value)} placeholder="https://example.com/og-image.png" />
          <p className="text-xs text-surface-400 mt-1">社交分享默认图片（推荐 1200x630px）</p>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={values.seo_sitemap_enabled === 'true'} onChange={(e) => update('seo_sitemap_enabled', e.target.checked ? 'true' : 'false')} className="w-4 h-4 accent-surface-900" />
            <span className="text-sm text-surface-700">启用 sitemap.xml</span>
          </label>
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={values.seo_robots_enabled === 'true'} onChange={(e) => update('seo_robots_enabled', e.target.checked ? 'true' : 'false')} className="w-4 h-4 accent-surface-900" />
            <span className="text-sm text-surface-700">启用 robots.txt</span>
          </label>
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

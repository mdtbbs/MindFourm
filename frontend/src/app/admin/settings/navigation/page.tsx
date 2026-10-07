'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import SettingsUnsavedChangesBar from '@/components/admin/settings-unsaved-changes-bar';
import {
  DEFAULT_TOP_NAVIGATION_ITEMS,
  parseTopNavigationItems,
  type TopNavigationItem,
} from '@/lib/navigation/top-navigation';

function prettyPrintNavigation(items: TopNavigationItem[]): string {
  return JSON.stringify(items, null, 2);
}

export default function NavigationSettingsPage() {
  const refreshAfterSettingsSave = useSettingsSaveRefresh();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const unsaved = useUnsavedChanges(values);
  const initializeUnsaved = unsaved.initialize;

  const fetchSettings = useCallback(async (resetBaseline = true) => {
    try {
      const data = await adminApi.getSettings('navigation');
      const raw = data.top_navigation_items;
      const normalized = prettyPrintNavigation(parseTopNavigationItems(raw));
      const nextValues = { ...data, top_navigation_items: normalized };
      setValues(nextValues);
      if (resetBaseline) initializeUnsaved(nextValues);
      return nextValues;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load navigation settings');
      return null;
    } finally {
      setLoading(false);
    }
  }, [initializeUnsaved]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const navigationSyntaxError = useMemo(() => {
    const raw = values.top_navigation_items?.trim();
    if (!raw) {
      return '导航 JSON 不能为空，请填写至少一个导航项或恢复默认导航。';
    }

    try {
      JSON.parse(raw);
      return null;
    } catch (err) {
      return err instanceof Error ? `JSON 格式错误：${err.message}` : '导航 JSON 格式错误';
    }
  }, [values.top_navigation_items]);

  const previewItems = useMemo(
    () => (navigationSyntaxError ? [] : parseTopNavigationItems(values.top_navigation_items)),
    [navigationSyntaxError, values.top_navigation_items],
  );

  const handleSave = async () => {
    if (!unsaved.isDirty || unsaved.isSaving || navigationSyntaxError) return;
    const submittedValues = { ...values };
    unsaved.setSaving();
    try {
      await adminApi.updateSettings('navigation', submittedValues);
      await refreshAfterSettingsSave();
      const refreshedValues = await fetchSettings(false);
      unsaved.markSaved(refreshedValues ?? submittedValues);
    } catch (err) {
      unsaved.setError(err instanceof Error ? err.message : 'Failed to save navigation settings');
    }
  };

  const update = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const resetToDefault = () => {
    update('top_navigation_items', prettyPrintNavigation(DEFAULT_TOP_NAVIGATION_ITEMS));
  };

  if (loading) {
    return <div className="py-8 text-center text-surface-500">加载中…</div>;
  }

  return (
    <div className={`bg-white border border-surface-200 ${unsaved.isDirty || unsaved.isSaving || unsaved.isSaved || unsaved.error ? 'pb-24' : ''}`}>
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">顶部导航</h2>
        <p className="text-xs text-surface-400 mt-1">
          历史顶部导航配置已保留供兼容读取；MDTBBS 固定 App Shell 不再使用它构建全局操作栏。
        </p>
      </div>

      <div className="p-6 space-y-6">
        {loadError && <Alert type="error" message={loadError} />}
        {navigationSyntaxError && <Alert type="error" message={navigationSyntaxError} />}

        <div className="border border-surface-200 bg-surface-50 p-4 text-xs text-surface-600 space-y-2">
          <div className="font-semibold text-surface-700">旧配置说明</div>
          <div>保存这些项目不会改变前台顶部搜索、创建、通知和用户菜单。</div>
          <div className="font-semibold text-surface-700">格式说明</div>
          <div>每个项目都需要 <code>type</code> 和 <code>label</code>。</div>
          <div><code>type: "link"</code> 时填写 <code>href</code>，可选 <code>newTab</code>。</div>
          <div><code>type: "group"</code> 时填写 <code>items</code> 数组，数组中的每个子项都需要 <code>label</code> 和 <code>href</code>。</div>
          <div>链接只能使用以 <code>/</code> 开头的站内地址或 <code>http(s)://</code> 外链。</div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">
            导航 JSON
          </label>
          <textarea
            className="min-h-[320px] w-full rounded border border-surface-200 px-3 py-2 font-mono text-sm focus:outline-none focus:border-surface-400"
            value={values.top_navigation_items ?? ''}
            onChange={(e) => update('top_navigation_items', e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="border-t border-surface-200 pt-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-surface-800">预览</h3>
              <p className="mt-1 text-xs text-surface-400">保存前可先确认最终导航结构。</p>
            </div>
            <Button variant="ghost" onClick={resetToDefault}>恢复默认导航</Button>
          </div>

          {previewItems.length === 0 ? (
            <div className="mt-4 border border-dashed border-surface-200 bg-surface-50 px-4 py-6 text-sm text-surface-500">
              修正 JSON 语法后，这里会显示导航预览。
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {previewItems.map((item, index) => (
                <div key={`${item.label}-${index}`} className="border border-surface-200 bg-surface-50 px-4 py-3 text-sm">
                  {item.type === 'group' ? (
                    <div className="space-y-2">
                      <div className="font-medium text-surface-800">{item.label}</div>
                      <div className="flex flex-wrap gap-2">
                        {item.items.map((child) => (
                          <span
                            key={`${item.label}-${child.href}`}
                            className="inline-flex items-center rounded border px-2 py-1 text-xs text-surface-600"
                          >
                            {child.label}
                            <span className="ml-2 font-mono text-[10px] text-surface-400">{child.href}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-surface-800">{item.label}</span>
                      <span className="font-mono text-xs text-surface-400">{item.href}</span>
                      {item.newTab && (
                        <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-surface-500">
                          新标签页
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SettingsUnsavedChangesBar
        dirty={unsaved.isDirty}
        saving={unsaved.isSaving}
        saved={unsaved.isSaved}
        error={unsaved.error}
        saveDisabled={Boolean(navigationSyntaxError)}
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

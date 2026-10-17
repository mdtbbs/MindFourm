'use client';

import { useCallback, useEffect, useState } from 'react';
import { sidebarNavApi, type SidebarNavigationItem } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';
import { NavigationEditor } from '@/components/admin/navigation-editor';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import SettingsUnsavedChangesBar from '@/components/admin/settings-unsaved-changes-bar';
import { validateSidebarNavigation } from '@/lib/navigation/sidebar-navigation';

export default function SidebarNavigationSettingsPage() {
  const refreshAfterSettingsSave = useSettingsSaveRefresh();
  const [items, setItems] = useState<SidebarNavigationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const unsaved = useUnsavedChanges({ items });
  const initializeUnsaved = unsaved.initialize;

  const fetchNavigation = useCallback(async () => {
    try {
      const data = await sidebarNavApi.get();
      const nextItems = Array.isArray(data) ? data : [];
      setItems(nextItems);
      initializeUnsaved({ items: nextItems });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载侧栏导航设置失败');
    } finally {
      setLoading(false);
    }
  }, [initializeUnsaved]);

  useEffect(() => {
    fetchNavigation();
  }, [fetchNavigation]);

  const handleSave = async (updatedItems: SidebarNavigationItem[]) => {
    if (!unsaved.isDirty || unsaved.isSaving) return;
    unsaved.setSaving();
    try {
      await sidebarNavApi.update(updatedItems);
      setItems(updatedItems);
      await refreshAfterSettingsSave();
      unsaved.markSaved({ items: updatedItems });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败';
      unsaved.setError(msg);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-surface-500">加载中...</div>;
  }

  return (
    <div className={`bg-white border border-surface-200 ${unsaved.isDirty || unsaved.isSaving || unsaved.isSaved || unsaved.error ? 'pb-24' : ''}`}>
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">侧栏导航</h2>
        <p className="text-xs text-surface-400 mt-1">
          历史侧栏配置已保留供兼容读取；MDTBBS 固定 App Shell 不再使用这些项目生成主导航。
        </p>
      </div>

      <div className="p-6 space-y-6">
        {loadError && <Alert type="error" message={loadError} />}

        <div className="border border-surface-200 bg-surface-50 p-4 text-xs text-surface-600 space-y-2">
          <div className="font-semibold text-surface-700">旧配置说明</div>
          <div>保存这些项目不会改变前台桌面侧栏或移动底栏；主导航固定为首页、社区、资源、联机、工具和我的。</div>
          <div>每个项目需要一个唯一标识、显示标签、跳转链接和图标。</div>
          <div>链接只能使用以 <code>/</code> 开头的站内地址或 <code>https://</code> 外链。</div>
          <div>勾选「需要登录」后，未登录用户将看不到该项目。</div>
        </div>

        <NavigationEditor initialItems={items} items={items} onItemsChange={setItems} onSave={handleSave} hideSave />
      </div>

      <SettingsUnsavedChangesBar
        dirty={unsaved.isDirty}
        saving={unsaved.isSaving}
        saved={unsaved.isSaved}
        error={unsaved.error}
        saveDisabled={!validateSidebarNavigation(items).valid}
        onDiscard={() => {
          const restored = unsaved.discard();
          if (restored) setItems(restored.items);
          setLoadError(null);
        }}
        onSave={() => { void handleSave(items); }}
      />
    </div>
  );
}

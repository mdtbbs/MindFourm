'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi, categoryApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import SettingsUnsavedChangesBar from '@/components/admin/settings-unsaved-changes-bar';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import type { Category } from '@/types';

interface PostSettings {
  default_post_category_id: string;
}

const EMPTY_SETTINGS: PostSettings = { default_post_category_id: '' };

export default function PostsSettingsPage() {
  const [values, setValues] = useState<PostSettings>(EMPTY_SETTINGS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const unsaved = useUnsavedChanges(values);
  const initializeUnsaved = unsaved.initialize;

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, categoryList] = await Promise.all([
        adminApi.getSettings('posts'),
        categoryApi.getList(),
      ]);
      const loadedValues = {
        default_post_category_id: settings.default_post_category_id ?? '',
      };
      setValues(loadedValues);
      setCategories(categoryList);
      initializeUnsaved(loadedValues);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '读取发帖设置失败');
    } finally {
      setLoading(false);
    }
  }, [initializeUnsaved]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    if (!unsaved.isDirty || unsaved.isSaving) return;
    const submittedValues = { ...values };
    unsaved.setSaving();
    try {
      await adminApi.updateSettings('posts', submittedValues);
      unsaved.markSaved(submittedValues);
    } catch (err) {
      unsaved.setError(err instanceof Error ? err.message : '保存发帖设置失败');
    }
  };

  if (loading) return <div className="py-8 text-center text-surface-500">加载中…</div>;

  const selectedCategoryIsActive = categories.some(
    (category) => String(category.id) === values.default_post_category_id,
  );

  return (
    <div className={`border border-surface-200 bg-white ${unsaved.isDirty || unsaved.isSaving || unsaved.isSaved || unsaved.error ? 'pb-24' : ''}`}>
      <div className="border-b border-surface-200 px-6 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">发帖设置</h2>
        <p className="mt-1 text-xs text-surface-400">配置用户创建帖子时未选择板块的默认去向。</p>
      </div>

      <div className="space-y-6 p-6">
        {loadError && <Alert type="error" message={loadError} />}

        <div className="max-w-xl">
          <label htmlFor="default-post-category" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-surface-600">
            默认发帖板块
          </label>
          <select
            id="default-post-category"
            className="w-full rounded border border-surface-200 px-3 py-2 text-sm"
            value={values.default_post_category_id}
            onChange={(event) => setValues((current) => ({ ...current, default_post_category_id: event.target.value }))}
          >
            <option value="">不设置默认板块</option>
            {values.default_post_category_id && !selectedCategoryIsActive && (
              <option value={values.default_post_category_id}>
                当前板块（ID {values.default_post_category_id}）已停用或不存在
              </option>
            )}
            {categories.map((category) => (
              <option key={category.id} value={String(category.id)}>{category.name}</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-surface-400">
            用户在发帖页留空时，帖子会归入这里选择的板块；用户主动选择其他板块时，按用户的选择发布。留空则不设置默认板块。
          </p>
          {categories.length === 0 && (
            <p className="mt-2 text-xs text-surface-400">当前没有可选的启用板块，请先在板块管理中启用一个板块。</p>
          )}
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

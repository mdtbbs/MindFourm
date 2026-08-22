'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';
import MarkdownEditor from '@/components/ui/markdown-editor';

export default function DisplaySettingsPage() {
  const refreshAfterSettingsSave = useSettingsSaveRefresh();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setValues(await adminApi.getSettings('display'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateSettings('display', values);
      await refreshAfterSettingsSave();
      setMessage('Saved');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <div className="py-8 text-center text-surface-500">Loading...</div>;
  }

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">显示设置</h2>
        <p className="text-xs text-surface-400 mt-1">控制首页和列表显示行为</p>
      </div>

      <div className="p-6 space-y-6">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div className="grid gap-5 md:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">
              每页帖子数
            </label>
            <input
              type="number"
              className="w-32 px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
              value={values.posts_per_page ?? '20'}
              onChange={(e) => update('posts_per_page', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">
              默认排序
            </label>
            <select
              className="px-3 py-2 border border-surface-200 rounded text-sm"
              value={values.default_sort ?? 'newest'}
              onChange={(e) => update('default_sort', e.target.value)}
            >
              <option value="newest">最新发布</option>
              <option value="popular">最热</option>
              <option value="replies">最多回复</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">
              每页回复数
            </label>
            <input
              type="number"
              className="w-32 px-3 py-2 border border-surface-200 rounded text-sm focus:outline-none focus:border-surface-400"
              value={values.replies_per_page ?? '50'}
              onChange={(e) => update('replies_per_page', e.target.value)}
            />
            <p className="text-xs text-surface-400 mt-1">帖子详情页每页显示的回复数量</p>
          </div>
        </div>

        <div className="border-t border-surface-200 pt-6">
          <h3 className="text-sm font-semibold text-surface-800">最新帖子</h3>
          <p className="mt-1 text-xs text-surface-400">
            标题和说明会显示在首页的最新讨论模块。
          </p>
        </div>

        <div>
          <div>
            <MarkdownEditor
              label="标题"
              value={values.latest_posts_title ?? '最新帖子'}
              onChange={(value) => update('latest_posts_title', value)}
              placeholder="例如：**最新帖子**"
              rows={3}
            />
          </div>

        </div>

        <div>
          <MarkdownEditor
            label="说明文字"
            value={values.latest_posts_description ?? '浅蓝、直角、低噪音的论坛界面，重点放在帖子层级和浏览效率。'}
            onChange={(value) => update('latest_posts_description', value)}
            placeholder="支持 **加粗**、列表、链接"
            rows={5}
          />
        </div>

      </div>

      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>Reset</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </div>
    </div>
  );
}

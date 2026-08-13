'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import { useSettingsSaveRefresh } from '@/hooks/use-settings-save-refresh';
import MarkdownEditor from '@/components/ui/markdown-editor';

const latestPostToggles = [
  ['latest_posts_show_index', '显示序号'],
  ['latest_posts_show_excerpt', '显示摘要'],
  ['latest_posts_show_tags', '显示标签'],
  ['latest_posts_show_stats', '显示回复/浏览/点赞'],
] as const;

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

  const toggle = (key: string, checked: boolean) => {
    update(key, checked ? 'true' : 'false');
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
            这里的标题和说明会同时显示在首页顶部和“最新帖子”模块，支持 Markdown 预览；这里的颜色只影响该模块，不会覆盖全站品牌色。
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <MarkdownEditor
              label="标题"
              value={values.latest_posts_title ?? '最新帖子'}
              onChange={(value) => update('latest_posts_title', value)}
              placeholder="例如：**最新帖子**"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">
              模块强调色
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 border border-surface-200 bg-white p-1"
                value={values.latest_posts_accent_color ?? '#2f80ed'}
                onChange={(e) => update('latest_posts_accent_color', e.target.value)}
              />
              <input
                className="w-32 px-3 py-2 border border-surface-200 rounded text-sm font-mono focus:outline-none focus:border-surface-400"
                value={values.latest_posts_accent_color ?? '#2f80ed'}
                onChange={(e) => update('latest_posts_accent_color', e.target.value)}
              />
            </div>
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

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">
            浏览密度
          </label>
          <select
            className="px-3 py-2 border border-surface-200 rounded text-sm"
            value={values.latest_posts_density ?? 'compact'}
            onChange={(e) => update('latest_posts_density', e.target.value)}
          >
            <option value="compact">紧凑</option>
            <option value="comfortable">舒展</option>
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {latestPostToggles.map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-700"
            >
              <input
                type="checkbox"
                checked={(values[key] ?? 'true') === 'true'}
                onChange={(e) => toggle(key, e.target.checked)}
                className="h-4 w-4 accent-surface-900"
              />
              {label}
            </label>
          ))}
        </div>

        <div className="border-t border-surface-200 pt-6">
          <label className="block text-xs font-semibold uppercase tracking-wider text-surface-600 mb-2">首页广告位</label>
          <p className="mb-2 text-xs text-surface-400">JSON 数组，每项含 title、description、href（可选）。只渲染站内或 http(s) 链接。</p>
          <textarea
            className="min-h-[150px] w-full rounded border border-surface-200 px-3 py-2 font-mono text-xs focus:outline-none focus:border-surface-400"
            value={values.home_ad_slots ?? '[]'}
            onChange={(e) => update('home_ad_slots', e.target.value)}
            placeholder={'[\n  {"title":"活动招募", "description":"说明", "href":"/posts/1"}\n]'}
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

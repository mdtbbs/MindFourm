'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

type ModerationSettingItem = {
  key: string;
  label: string;
  description: string;
};

const moderationSettings: ModerationSettingItem[] = [
  {
    key: 'require_post_approval',
    label: '帖子审核',
    description: '开启后，用户发表的新帖子先进入待审核；关闭后直接发布。',
  },
  {
    key: 'require_reply_approval',
    label: '回复审核',
    description: '开启后，用户发表的新回复先进入待审核；关闭后直接显示在帖子中。',
  },
  {
    key: 'require_avatar_approval',
    label: '头像审核',
    description: '开启后，用户上传头像需要管理员通过后才会应用。',
  },
];

export default function ModerationSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      setValues(await adminApi.getSettings('moderation'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载审核设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const toggle = (key: string, checked: boolean) => {
    setValues((prev) => ({ ...prev, [key]: checked ? 'true' : 'false' }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await adminApi.updateSettings('moderation', values);
      setMessage('审核设置已保存');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存审核设置失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-surface-500">Loading...</div>;
  }

  return (
    <div className="bg-white border border-surface-200">
      <div className="px-6 py-4 border-b border-surface-200">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">审核开关</h2>
        <p className="text-xs text-surface-400 mt-1">
          控制用户发布内容时是进入后台审核队列，还是跳过审核直接发布。
        </p>
      </div>

      <div className="p-6 space-y-4">
        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          已经进入待审核队列的内容不会因为关闭开关自动通过；关闭后只影响之后新发布的内容。
        </div>

        <div className="space-y-3">
          {moderationSettings.map((setting) => {
            const enabled = (values[setting.key] ?? 'true') === 'true';

            return (
              <div key={setting.key} className="flex items-start justify-between gap-4 border border-surface-200 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-surface-800">{setting.label}</span>
                    <span className={`border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${enabled ? 'border-amber-200 text-amber-700' : 'border-green-200 text-green-700'}`}>
                      {enabled ? '开启审核' : '跳过审核'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-surface-500">{setting.description}</p>
                </div>

                <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={enabled}
                    onChange={(e) => toggle(setting.key, e.target.checked)}
                  />
                  <div className="peer h-6 w-11 border border-surface-200 bg-surface-100 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-surface-200 after:bg-white after:transition-all peer-checked:border-amber-500 peer-checked:bg-amber-100 peer-checked:after:translate-x-full peer-checked:after:border-amber-500 peer-checked:after:bg-amber-500" />
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-6 py-4 border-t border-surface-200 flex gap-2 justify-end">
        <Button variant="ghost" onClick={fetchSettings}>重置</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
      </div>
    </div>
  );
}

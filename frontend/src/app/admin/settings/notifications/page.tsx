'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

const ROLE_OPTIONS = [
  { value: 'moderator', label: '版主' },
  { value: 'admin', label: '管理员' },
];

function parseRoles(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function NotificationSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roles = useMemo(
    () => new Set(parseRoles(values.admin_notifications_recipient_roles)),
    [values.admin_notifications_recipient_roles],
  );

  const fetchSettings = useCallback(async () => {
    try {
      setValues(await adminApi.getSettings('notifications'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载通知设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const update = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleBoolean = (key: string, checked: boolean) => {
    update(key, checked ? 'true' : 'false');
  };

  const toggleRole = (role: string, checked: boolean) => {
    const nextRoles = new Set(roles);
    if (checked) nextRoles.add(role);
    else nextRoles.delete(role);
    update('admin_notifications_recipient_roles', [...nextRoles].join(','));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateSettings('notifications', values);
      setMessage('通知设置已保存');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存通知设置失败');
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
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">后台通知</h2>
        <p className="text-xs text-surface-400 mt-1">配置后台消息收件箱、实时推送和审核类事件开关。</p>
      </div>

      <div className="p-6 space-y-6">
        {message ? <Alert type="success" message={message} /> : null}
        {error ? <Alert type="error" message={error} /> : null}

        <div className="space-y-3">
          <label className="flex items-center gap-3 text-sm text-surface-700">
            <input
              type="checkbox"
              checked={(values.admin_notifications_enabled ?? 'true') === 'true'}
              onChange={(e) => toggleBoolean('admin_notifications_enabled', e.target.checked)}
              className="h-4 w-4 accent-surface-900"
            />
            启用后台通知收件箱
          </label>

          <label className="flex items-center gap-3 text-sm text-surface-700">
            <input
              type="checkbox"
              checked={(values.admin_notifications_realtime_enabled ?? 'true') === 'true'}
              onChange={(e) => toggleBoolean('admin_notifications_realtime_enabled', e.target.checked)}
              className="h-4 w-4 accent-surface-900"
            />
            启用后台实时推送
          </label>
        </div>

        <div className="border-t border-surface-200 pt-6">
          <h3 className="text-sm font-semibold text-surface-800">事件范围</h3>
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-3 text-sm text-surface-700">
              <input
                type="checkbox"
                checked={(values.admin_notifications_moderation_pending_enabled ?? 'true') === 'true'}
                onChange={(e) => toggleBoolean('admin_notifications_moderation_pending_enabled', e.target.checked)}
                className="h-4 w-4 accent-surface-900"
              />
              新的待审核内容
            </label>

            <label className="flex items-center gap-3 text-sm text-surface-700">
              <input
                type="checkbox"
                checked={(values.admin_notifications_moderation_result_enabled ?? 'true') === 'true'}
                onChange={(e) => toggleBoolean('admin_notifications_moderation_result_enabled', e.target.checked)}
                className="h-4 w-4 accent-surface-900"
              />
              审核通过 / 拒绝结果
            </label>
          </div>
        </div>

        <div className="border-t border-surface-200 pt-6">
          <h3 className="text-sm font-semibold text-surface-800">接收角色</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {ROLE_OPTIONS.map((role) => (
              <label
                key={role.value}
                className="flex items-center gap-3 border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-700"
              >
                <input
                  type="checkbox"
                  checked={roles.has(role.value)}
                  onChange={(e) => toggleRole(role.value, e.target.checked)}
                  className="h-4 w-4 accent-surface-900"
                />
                {role.label}
              </label>
            ))}
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

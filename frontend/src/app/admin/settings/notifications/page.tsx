'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import SettingsUnsavedChangesBar from '@/components/admin/settings-unsaved-changes-bar';

const ROLE_OPTIONS = [
  { value: 'moderator', label: '版主' },
  { value: 'admin', label: '管理员' },
];

/**
 * The API masks stored secrets with this sentinel. Posting it back leaves the
 * stored value untouched, so it doubles as "keep what you have".
 */
const SECRET_PLACEHOLDER = '__unchanged__';

function parseRoles(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function NotificationSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const unsaved = useUnsavedChanges(values);
  const initializeUnsaved = unsaved.initialize;

  const roles = useMemo(
    () => new Set(parseRoles(values.admin_notifications_recipient_roles)),
    [values.admin_notifications_recipient_roles],
  );
  const webhookEnabled = (values.admin_notifications_webhook_enabled ?? 'false') === 'true';
  const secretValue = values.admin_notifications_webhook_secret ?? '';
  const secretIsStored = secretValue === SECRET_PLACEHOLDER;

  const fetchSettings = useCallback(async () => {
    try {
      const data = await adminApi.getSettings('notifications');
      setValues(data);
      initializeUnsaved(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载通知设置失败');
    } finally {
      setLoading(false);
    }
  }, [initializeUnsaved]);

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
    if (!unsaved.isDirty || unsaved.isSaving) return;
    const submittedValues = { ...values };
    unsaved.setSaving();
    try {
      await adminApi.updateSettings('notifications', submittedValues);
      unsaved.markSaved(submittedValues);
    } catch (err) {
      unsaved.setError(err instanceof Error ? err.message : '保存通知设置失败');
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-surface-500">Loading...</div>;
  }

  return (
    <div className={`border border-surface-200 bg-white ${unsaved.isDirty || unsaved.isSaving || unsaved.isSaved || unsaved.error ? 'pb-24' : ''}`}>
      <div className="border-b border-surface-200 px-6 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">后台通知</h2>
        <p className="mt-1 text-xs text-surface-400">
          配置后台通知系统、实时推送、第三方 Webhook 渠道和审核事件开关。
        </p>
      </div>

      <div className="space-y-6 p-6">
        {loadError ? <Alert type="error" message={loadError} /> : null}

        <div className="space-y-3">
          <label className="flex items-center gap-3 text-sm text-surface-700">
            <input
              type="checkbox"
              checked={(values.admin_notifications_enabled ?? 'true') === 'true'}
              onChange={(e) => toggleBoolean('admin_notifications_enabled', e.target.checked)}
              className="h-4 w-4 accent-surface-900"
            />
            启用后台通知系统
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-surface-800">Webhook 渠道</h3>
              <p className="mt-1 text-xs text-surface-500">
                启用后，后台通知会额外以 JSON POST 的形式投递到第三方地址。
              </p>
            </div>

            <label className="flex items-center gap-3 text-sm text-surface-700">
              <input
                type="checkbox"
                checked={webhookEnabled}
                onChange={(e) => toggleBoolean('admin_notifications_webhook_enabled', e.target.checked)}
                className="h-4 w-4 accent-surface-900"
              />
              启用 Webhook
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-surface-700">
              <span className="mb-2 block">Webhook URL</span>
              <input
                type="url"
                value={values.admin_notifications_webhook_url ?? ''}
                onChange={(e) => update('admin_notifications_webhook_url', e.target.value)}
                placeholder="https://example.com/hooks/admin"
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm"
                disabled={!webhookEnabled}
              />
            </label>

            <label className="block text-sm text-surface-700">
              <span className="mb-2 block">签名密钥</span>
              <input
                type="password"
                value={secretIsStored ? '' : secretValue}
                onChange={(e) =>
                  update(
                    'admin_notifications_webhook_secret',
                    // An empty box means "leave the stored secret alone"; clearing
                    // it requires the button below.
                    e.target.value === '' ? SECRET_PLACEHOLDER : e.target.value,
                  )
                }
                placeholder={secretIsStored ? '已设置，留空则保持不变' : 'optional shared secret'}
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm"
                disabled={!webhookEnabled}
              />
              {secretIsStored && (
                <button
                  type="button"
                  onClick={() => update('admin_notifications_webhook_secret', '')}
                  className="mt-2 text-xs text-surface-500 underline"
                  disabled={!webhookEnabled}
                >
                  清除已保存的密钥
                </button>
              )}
            </label>

            <label className="block text-sm text-surface-700 md:col-span-2">
              <span className="mb-2 block">请求超时（毫秒）</span>
              <input
                type="number"
                min="1000"
                step="1000"
                value={values.admin_notifications_webhook_timeout_ms ?? '5000'}
                onChange={(e) => update('admin_notifications_webhook_timeout_ms', e.target.value)}
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm md:max-w-xs"
                disabled={!webhookEnabled}
              />
            </label>
          </div>

          <div className="mt-4 border border-surface-200 bg-surface-50 p-4 text-xs text-surface-600">
            <div className="font-semibold text-surface-700">请求说明</div>
            <div className="mt-2 font-mono">POST application/json</div>
            <div className="mt-1 font-mono">X-MindForum-Event: admin-notification</div>
            <div className="mt-1 font-mono">X-MindForum-Signature: sha256=... （配置密钥后才会附带）</div>
            <div className="mt-2">
              Payload 会包含事件键、标题、内容、目标收件人 ID 列表和已创建的后台通知数组。
            </div>
          </div>
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

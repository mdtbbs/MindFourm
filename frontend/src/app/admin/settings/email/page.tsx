'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';

type EmailTemplateKey = 'reply' | 'mention' | 'message' | 'system' | 'welcome';
const SECRET_PLACEHOLDER = '__unchanged__';

const TEMPLATE_FIELDS: Array<{
  key: EmailTemplateKey;
  label: string;
  enabledKey: string;
  subjectKey: string;
  bodyKey: string;
  description: string;
}> = [
  {
    key: 'reply',
    label: '回复通知',
    enabledKey: 'email_reply_enabled',
    subjectKey: 'email_template_reply_subject',
    bodyKey: 'email_template_reply_body',
    description: '帖子收到新回复时发送给作者。',
  },
  {
    key: 'mention',
    label: '@ 提及通知',
    enabledKey: 'email_mention_enabled',
    subjectKey: 'email_template_mention_subject',
    bodyKey: 'email_template_mention_body',
    description: '有人在帖子或回复里提到用户时发送。',
  },
  {
    key: 'message',
    label: '私信通知',
    enabledKey: 'email_message_enabled',
    subjectKey: 'email_template_message_subject',
    bodyKey: 'email_template_message_body',
    description: '收到新的站内私信时发送。',
  },
  {
    key: 'system',
    label: '系统通知',
    enabledKey: 'email_system_enabled',
    subjectKey: 'email_template_system_subject',
    bodyKey: 'email_template_system_body',
    description: '系统级站内通知的邮件副本。',
  },
  {
    key: 'welcome',
    label: '欢迎邮件',
    enabledKey: 'email_welcome_enabled',
    subjectKey: 'email_template_welcome_subject',
    bodyKey: 'email_template_welcome_body',
    description: '新用户首次创建论坛账号后发送。',
  },
];

const TEMPLATE_VARIABLE_HINTS: Record<EmailTemplateKey, string[]> = {
  reply: ['{{site_name}}', '{{username}}', '{{actor_name}}', '{{post_title}}', '{{post_url}}', '{{reply_excerpt}}', '{{action_url}}', '{{action_label}}'],
  mention: ['{{site_name}}', '{{username}}', '{{actor_name}}', '{{post_title}}', '{{post_url}}', '{{mention_excerpt}}', '{{action_url}}', '{{action_label}}'],
  message: ['{{site_name}}', '{{username}}', '{{sender_name}}', '{{message_excerpt}}', '{{message_url}}', '{{action_url}}', '{{action_label}}'],
  system: ['{{site_name}}', '{{username}}', '{{content}}', '{{action_url}}', '{{action_label}}'],
  welcome: ['{{site_name}}', '{{username}}', '{{content}}', '{{action_url}}', '{{action_label}}'],
};

export default function EmailSettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<EmailTemplateKey>('reply');

  const fetchSettings = useCallback(async () => {
    try {
      const data = await adminApi.getSettings('email');
      setValues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载邮件设置失败');
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

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateSettings('email', values);
      setMessage('邮件设置已保存');
      setTimeout(() => setMessage(null), 3000);
      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存邮件设置失败');
    } finally {
      setSaving(false);
    }
  };

  const smtpPasswordValue = values.smtp_password ?? '';
  const smtpPasswordStored = smtpPasswordValue === SECRET_PLACEHOLDER;
  const activeConfig = TEMPLATE_FIELDS.find((item) => item.key === activeTemplate) ?? TEMPLATE_FIELDS[0];
  const welcomeNoticeEnabled = (values.welcome_notification_enabled ?? 'true') === 'true';
  const smtpSecureEnabled = (values.smtp_secure ?? 'true') === 'true';

  const variableHints = useMemo(
    () => TEMPLATE_VARIABLE_HINTS[activeTemplate],
    [activeTemplate],
  );

  if (loading) {
    return <div className="py-8 text-center text-surface-500">Loading...</div>;
  }

  return (
    <div className="border border-surface-200 bg-white">
      <div className="border-b border-surface-200 px-6 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-700">邮件模板</h2>
        <p className="mt-1 text-xs text-surface-400">
          配置 SMTP、欢迎通知和回复 / 提及 / 私信 / 系统 / 欢迎邮件模板。正文支持 Markdown。
        </p>
      </div>

      <div className="space-y-8 p-6">
        {message ? <Alert type="success" message={message} /> : null}
        {error ? <Alert type="error" message={error} /> : null}

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-surface-800">SMTP 配置</h3>
            <p className="mt-1 text-xs text-surface-500">用于发送站外邮件提醒。未配置时，站内通知仍会正常工作。</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-surface-700">
              <span className="mb-2 block">SMTP 主机</span>
              <input
                type="text"
                value={values.smtp_host ?? ''}
                onChange={(e) => update('smtp_host', e.target.value)}
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm"
                placeholder="smtp.example.com"
              />
            </label>

            <label className="block text-sm text-surface-700">
              <span className="mb-2 block">SMTP 端口</span>
              <input
                type="number"
                value={values.smtp_port ?? '587'}
                onChange={(e) => update('smtp_port', e.target.value)}
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-sm text-surface-700">
              <span className="mb-2 block">SMTP 用户名</span>
              <input
                type="text"
                value={values.smtp_user ?? ''}
                onChange={(e) => update('smtp_user', e.target.value)}
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm"
                placeholder="noreply@example.com"
              />
            </label>

            <label className="block text-sm text-surface-700">
              <span className="mb-2 block">SMTP 密码</span>
              <input
                type="password"
                value={smtpPasswordStored ? '' : smtpPasswordValue}
                onChange={(e) => update('smtp_password', e.target.value === '' ? SECRET_PLACEHOLDER : e.target.value)}
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm"
                placeholder={smtpPasswordStored ? '已设置，留空则保持不变' : '留空则保持现有值'}
              />
              {smtpPasswordStored && (
                <button
                  type="button"
                  onClick={() => update('smtp_password', '')}
                  className="mt-2 text-xs text-surface-500 underline"
                >
                  清除已保存的密码
                </button>
              )}
            </label>

            <label className="block text-sm text-surface-700 md:col-span-2">
              <span className="mb-2 block">发件人地址</span>
              <input
                type="email"
                value={values.smtp_from ?? ''}
                onChange={(e) => update('smtp_from', e.target.value)}
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm md:max-w-xl"
                placeholder="MindFourm <noreply@example.com>"
              />
            </label>

            <label className="flex items-center gap-3 text-sm text-surface-700 md:col-span-2">
              <input
                type="checkbox"
                checked={smtpSecureEnabled}
                onChange={(e) => toggleBoolean('smtp_secure', e.target.checked)}
                className="h-4 w-4 accent-surface-900"
              />
              启用 TLS / SSL 安全连接
            </label>
          </div>
        </section>

        <section className="space-y-4 border-t border-surface-200 pt-6">
          <div>
            <h3 className="text-sm font-semibold text-surface-800">欢迎站内通知</h3>
            <p className="mt-1 text-xs text-surface-500">首次创建论坛用户档案时发送，正文支持 Markdown。</p>
          </div>

          <label className="flex items-center gap-3 text-sm text-surface-700">
            <input
              type="checkbox"
              checked={welcomeNoticeEnabled}
              onChange={(e) => toggleBoolean('welcome_notification_enabled', e.target.checked)}
              className="h-4 w-4 accent-surface-900"
            />
            启用欢迎站内通知
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-surface-700 md:col-span-2">
              <span className="mb-2 block">欢迎通知标题模板</span>
              <input
                type="text"
                value={values.welcome_notification_title ?? ''}
                onChange={(e) => update('welcome_notification_title', e.target.value)}
                className="w-full border border-surface-200 bg-white px-3 py-2 text-sm md:max-w-xl"
              />
            </label>

            <label className="block text-sm text-surface-700 md:col-span-2">
              <span className="mb-2 block">欢迎通知正文模板</span>
              <textarea
                value={values.welcome_notification_body ?? ''}
                onChange={(e) => update('welcome_notification_body', e.target.value)}
                className="min-h-[180px] w-full border border-surface-200 bg-white px-3 py-2 font-mono text-sm"
                spellCheck={false}
              />
            </label>
          </div>

          <div className="border border-surface-200 bg-surface-50 p-4 text-xs text-surface-600">
            可用变量：<code>{'{{site_name}}'}</code>、<code>{'{{username}}'}</code>
          </div>
        </section>

        <section className="space-y-4 border-t border-surface-200 pt-6">
          <div>
            <h3 className="text-sm font-semibold text-surface-800">邮件事件模板</h3>
            <p className="mt-1 text-xs text-surface-500">每类邮件都可以单独关闭，也可以分别修改主题和正文模板。</p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[240px,1fr]">
            <div className="space-y-2">
              {TEMPLATE_FIELDS.map((item) => {
                const enabled = (values[item.enabledKey] ?? 'true') === 'true';
                const active = item.key === activeTemplate;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveTemplate(item.key)}
                    className={`w-full border px-3 py-3 text-left text-sm transition-colors ${
                      active
                        ? 'border-surface-900 bg-surface-900 text-white'
                        : 'border-surface-200 bg-surface-50 text-surface-700 hover:bg-surface-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{item.label}</span>
                      <span className={`text-xs ${active ? 'text-white/80' : enabled ? 'text-emerald-600' : 'text-surface-400'}`}>
                        {enabled ? '已启用' : '已关闭'}
                      </span>
                    </div>
                    <p className={`mt-1 text-xs ${active ? 'text-white/80' : 'text-surface-500'}`}>{item.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="border border-surface-200 bg-surface-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-surface-800">{activeConfig.label}</h4>
                  <p className="mt-1 text-xs text-surface-500">{activeConfig.description}</p>
                </div>

                <label className="flex items-center gap-3 text-sm text-surface-700">
                  <input
                    type="checkbox"
                    checked={(values[activeConfig.enabledKey] ?? 'true') === 'true'}
                    onChange={(e) => toggleBoolean(activeConfig.enabledKey, e.target.checked)}
                    className="h-4 w-4 accent-surface-900"
                  />
                  启用此类邮件
                </label>
              </div>

              <div className="mt-4 space-y-4">
                <label className="block text-sm text-surface-700">
                  <span className="mb-2 block">邮件主题模板</span>
                  <input
                    type="text"
                    value={values[activeConfig.subjectKey] ?? ''}
                    onChange={(e) => update(activeConfig.subjectKey, e.target.value)}
                    className="w-full border border-surface-200 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <label className="block text-sm text-surface-700">
                  <span className="mb-2 block">邮件正文模板（Markdown）</span>
                  <textarea
                    value={values[activeConfig.bodyKey] ?? ''}
                    onChange={(e) => update(activeConfig.bodyKey, e.target.value)}
                    className="min-h-[260px] w-full border border-surface-200 bg-white px-3 py-2 font-mono text-sm"
                    spellCheck={false}
                  />
                </label>
              </div>

              <div className="mt-4 border border-surface-200 bg-white p-4 text-xs text-surface-600">
                <div className="font-semibold text-surface-700">当前模板可用变量</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {variableHints.map((item) => (
                    <code key={item} className="rounded border border-surface-200 bg-surface-50 px-2 py-1">
                      {item}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="flex justify-end gap-2 border-t border-surface-200 px-6 py-4">
        <Button variant="ghost" onClick={fetchSettings}>重置</Button>
        <Button onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
      </div>
    </div>
  );
}

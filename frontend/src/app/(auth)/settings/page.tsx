'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import { api } from '@/lib/api/client';
import Link from 'next/link';

interface EmailPreferences {
  reply_email: boolean;
  mention_email: boolean;
  message_email: boolean;
  system_email: boolean;
  digest_email: boolean;
}

const EMAIL_OPTIONS: { key: keyof EmailPreferences; label: string; description: string }[] = [
  { key: 'reply_email', label: '新回复通知', description: '有人回复了你的帖子时发送邮件' },
  { key: 'mention_email', label: '@提及通知', description: '有人 @提及 了你时发送邮件' },
  { key: 'message_email', label: '私信通知', description: '收到新私信时发送邮件' },
  { key: 'system_email', label: '系统通知', description: '系统重要通知（如举报处理结果）' },
  { key: 'digest_email', label: '每周精选', description: '每周发送热门内容汇总' },
];

export default function SettingsPage() {
  const { user, isAuthenticated } = useAuth();
  const [preferences, setPreferences] = useState<EmailPreferences>({
    reply_email: true,
    mention_email: true,
    message_email: true,
    system_email: true,
    digest_email: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadPreferences();
  }, [isAuthenticated]);

  const loadPreferences = async () => {
    try {
      const res = await api.get<{ data: { data: EmailPreferences } }>('/api/notifications/email-preference');
      setPreferences(res.data.data);
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: keyof EmailPreferences) => {
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/api/notifications/email-preference', preferences);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save preferences:', error);
    } finally {
      setSaving(false);
    }
  };

  // The header and footer come from the (auth) route group's layout; this page used
  // to render its own UnifiedHeader because that layout did not exist.
  return (
    <div className="bg-[var(--bg)]">
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-primary">首页</Link>
            <span>/</span>
            <span>设置</span>
          </nav>
        </div>

        <h1 className="text-2xl font-bold mb-6">设置</h1>

        {/* The block list had no entry point at all and was reachable only by typing the
            URL, which for a privacy control is the same as not shipping it. */}
        <nav className="mb-6 flex flex-wrap gap-2">
          <span className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-white">
            通知设置
          </span>
          <Link
            href="/settings/blocks"
            className="rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
          >
            拉黑列表
          </Link>
        </nav>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="card p-6">
            <p className="text-sm text-muted-foreground mb-4">
              配置接收邮件通知的偏好设置。所有通知都会保存在站内通知列表中，邮件作为额外提醒。
            </p>

            <div className="space-y-4">
              {EMAIL_OPTIONS.map(({ key, label, description }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                >
                  <div>
                    <div className="font-medium">{label}</div>
                    <div className="text-sm text-muted-foreground">{description}</div>
                  </div>
                  <button
                    onClick={() => handleToggle(key)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      preferences[key] ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    role="switch"
                    aria-checked={preferences[key]}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        preferences[key] ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? '保存中...' : '保存设置'}
              </button>
              {saved && (
                <span className="text-sm text-success">已保存</span>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

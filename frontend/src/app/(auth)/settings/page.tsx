'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import { notificationApi } from '@/lib/api/client';
import Link from 'next/link';
import { useI18n } from '@/i18n/provider';

interface EmailPreferences {
  reply_email: boolean;
  mention_email: boolean;
  message_email: boolean;
  system_email: boolean;
  digest_email: boolean;
}

const EMAIL_OPTIONS: { key: keyof EmailPreferences; label: string; description: string }[] = [
  { key: 'reply_email', label: 'replyLabel', description: 'replyDescription' },
  { key: 'mention_email', label: 'mentionLabel', description: 'mentionDescription' },
  { key: 'message_email', label: 'messageLabel', description: 'messageDescription' },
  { key: 'system_email', label: 'systemLabel', description: 'systemDescription' },
  { key: 'digest_email', label: 'digestLabel', description: 'digestDescription' },
];

export default function SettingsPage() {
  const { t } = useI18n();
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
      const res = await notificationApi.getEmailPreference();
      setPreferences(res);
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
      await notificationApi.updateEmailPreference(preferences);
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
            <Link href="/" className="hover:text-primary">{t('emailSettings.home')}</Link>
            <span>/</span>
            <span>{t('emailSettings.settings')}</span>
          </nav>
        </div>

        <h1 className="text-2xl font-bold mb-6">{t('emailSettings.title')}</h1>

        {/* The block list had no entry point at all and was reachable only by typing the
            URL, which for a privacy control is the same as not shipping it. */}
        <nav className="mb-6 flex flex-wrap gap-2">
          <span className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-white">
            {t('emailSettings.notifications')}
          </span>
          <Link
            href="/settings/blocks"
            className="rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
          >
            {t('emailSettings.blockedUsers')}
          </Link>
        </nav>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="card p-6">
            <p className="text-sm text-muted-foreground mb-4">
              {t('emailSettings.description')}
            </p>

            <div className="space-y-4">
              {EMAIL_OPTIONS.map(({ key, label, description }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                >
                  <div>
                    <div className="font-medium">{t(`emailSettings.${label}`)}</div>
                    <div className="text-sm text-muted-foreground">{t(`emailSettings.${description}`)}</div>
                  </div>
                  <button
                    onClick={() => handleToggle(key)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      preferences[key] ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                    role="switch"
                    aria-checked={preferences[key]}
                    aria-label={t(`emailSettings.${label}`)}
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
                {saving ? t('emailSettings.saving') : t('emailSettings.save')}
              </button>
              {saved && (
                <span className="text-sm text-success">{t('emailSettings.saved')}</span>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

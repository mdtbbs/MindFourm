'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import { notificationApi } from '@/lib/api/client';
import Link from 'next/link';
import { useI18n } from '@/i18n/provider';
import { fetchV1, requestV1 } from '@/lib/api/v1/transport';
import { userApi } from '@/lib/api/client';
import { localeNames, type Locale } from '@/i18n';
import { siteProfile } from '@/config/site-profile';

interface EmailPreferences {
  reply_email: boolean;
  mention_email: boolean;
  message_email: boolean;
  system_email: boolean;
  digest_email: boolean;
}

type MessagePrivacy = 'everyone' | 'friends' | 'nobody';
type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible';
type SocialPrivacy = {
  status: PresenceStatus;
  presence_visibility: MessagePrivacy;
  activity_visibility: MessagePrivacy;
  allow_join: MessagePrivacy;
  allow_join_request: MessagePrivacy;
  allow_invites: MessagePrivacy;
  allow_messages: MessagePrivacy;
  show_last_seen: boolean;
};

const DEFAULT_SOCIAL_PRIVACY: SocialPrivacy = {
  status: 'online', presence_visibility: 'friends', activity_visibility: 'friends',
  allow_join: 'friends', allow_join_request: 'friends', allow_invites: 'friends',
  allow_messages: 'everyone', show_last_seen: true,
};

const EMAIL_OPTIONS: { key: keyof EmailPreferences; label: string; description: string }[] = [
  { key: 'reply_email', label: 'replyLabel', description: 'replyDescription' },
  { key: 'mention_email', label: 'mentionLabel', description: 'mentionDescription' },
  { key: 'message_email', label: 'messageLabel', description: 'messageDescription' },
  { key: 'system_email', label: 'systemLabel', description: 'systemDescription' },
  { key: 'digest_email', label: 'digestLabel', description: 'digestDescription' },
];

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { user, isAuthenticated, refreshAuth } = useAuth();
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
  const [cloudSavesEnabled, setCloudSavesEnabled] = useState(false);
  const [preferredContentLanguage, setPreferredContentLanguage] = useState(user?.preferred_content_language || '');
  const [contentLanguageSaving, setContentLanguageSaving] = useState(false);
  const [contentLanguageSaved, setContentLanguageSaved] = useState(false);
  const [messagePrivacy, setMessagePrivacy] = useState<MessagePrivacy>('everyone');
  const [messagePrivacyLoading, setMessagePrivacyLoading] = useState(true);
  const [messagePrivacySaving, setMessagePrivacySaving] = useState(false);
  const [messagePrivacySaved, setMessagePrivacySaved] = useState(false);
  const [messagePrivacyError, setMessagePrivacyError] = useState<string | null>(null);
  const [socialPrivacy, setSocialPrivacy] = useState<SocialPrivacy>(DEFAULT_SOCIAL_PRIVACY);
  const [socialPrivacyLoading, setSocialPrivacyLoading] = useState(true);
  const [socialPrivacySaving, setSocialPrivacySaving] = useState(false);
  const [socialPrivacySaved, setSocialPrivacySaved] = useState(false);
  const [socialPrivacyError, setSocialPrivacyError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadPreferences();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchV1<Partial<SocialPrivacy>>('/social/privacy')
      .then((settings) => {
        const value = { ...DEFAULT_SOCIAL_PRIVACY, ...settings };
        setSocialPrivacy(value);
        setMessagePrivacy(value.allow_messages);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : t('messagePrivacy.loadFailed');
        setMessagePrivacyError(message);
        setSocialPrivacyError(message);
      })
      .finally(() => { setMessagePrivacyLoading(false); setSocialPrivacyLoading(false); });
  }, [isAuthenticated, t]);

  useEffect(() => {
    if (user?.preferred_content_language) setPreferredContentLanguage(user.preferred_content_language);
  }, [user?.preferred_content_language]);

  const saveContentLanguage = async () => {
    setContentLanguageSaving(true);
    try {
      const contentLanguage = siteProfile.contentLanguages.find((item) => item === preferredContentLanguage) ?? null;
      await userApi.updateProfile({ preferred_content_language: contentLanguage });
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `forum_content_language=${encodeURIComponent(contentLanguage || 'auto')}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
      await refreshAuth();
      setContentLanguageSaved(true);
      window.setTimeout(() => setContentLanguageSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save content-language preference:', error);
    } finally {
      setContentLanguageSaving(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchV1<{ cloud_saves_v1: boolean }>('/capabilities')
      .then((capabilities) => setCloudSavesEnabled(Boolean(capabilities.cloud_saves_v1)))
      .catch(() => setCloudSavesEnabled(false));
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

  const saveMessagePrivacy = async () => {
    setMessagePrivacySaving(true);
    setMessagePrivacyError(null);
    try {
      await requestV1('/social/privacy', { method: 'PATCH', body: JSON.stringify({ allow_messages: messagePrivacy }) });
      setSocialPrivacy((current) => ({ ...current, allow_messages: messagePrivacy }));
      setMessagePrivacySaved(true);
      window.setTimeout(() => setMessagePrivacySaved(false), 3000);
    } catch (error) {
      setMessagePrivacyError(error instanceof Error ? error.message : t('messagePrivacy.saveFailed'));
    } finally {
      setMessagePrivacySaving(false);
    }
  };

  const saveSocialPrivacy = async () => {
    setSocialPrivacySaving(true);
    setSocialPrivacyError(null);
    try {
      const savedSettings = await requestV1<SocialPrivacy>('/social/privacy', {
        method: 'PATCH', body: JSON.stringify(socialPrivacy),
      });
      setSocialPrivacy(savedSettings);
      setMessagePrivacy(savedSettings.allow_messages);
      window.dispatchEvent(new CustomEvent('forum:presence-preference-change', { detail: { status: savedSettings.status } }));
      setSocialPrivacySaved(true);
      window.setTimeout(() => setSocialPrivacySaved(false), 3000);
    } catch (error) {
      setSocialPrivacyError(error instanceof Error ? error.message : t('socialPrivacy.saveFailed'));
    } finally {
      setSocialPrivacySaving(false);
    }
  };

  const updateSocialPrivacy = <K extends keyof SocialPrivacy>(key: K, value: SocialPrivacy[K]) => {
    setSocialPrivacy((current) => ({ ...current, [key]: value }));
    setSocialPrivacySaved(false);
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

        {siteProfile.features.phoneVerification && (
          <section className="mb-6 border border-[var(--border)] bg-[var(--bg-card)] p-5" aria-labelledby="phone-verification-status-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="phone-verification-status-title" className="text-lg font-semibold">手机号安全验证</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  用于国内站内容发布和部分社区互动功能的账号安全验证。
                </p>
              </div>
              {user?.phone_verified ? (
                <span className="border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  已验证
                </span>
              ) : (
                <Link
                  href="/verify-phone?redirect=%2Fsettings"
                  className="border border-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/5"
                >
                  去验证
                </Link>
              )}
            </div>
          </section>
        )}

        {siteProfile.contentLanguagePreference && <section className="card mb-6 p-6" aria-labelledby="language-settings-title">
          <h2 id="language-settings-title" className="text-lg font-semibold">{t('languageSettings.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('languageSettings.description')}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="account-language" className="mb-2 block text-sm font-medium">{t('languageSettings.accountLanguage')}</label>
              <select id="account-language" value={locale} onChange={(event) => setLocale(event.target.value as Locale)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]">
                {(['en', 'ru', 'ja', 'zh-CN'] as Locale[]).map((item) => <option key={item} value={item}>{localeNames[item]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="feed-language" className="mb-2 block text-sm font-medium">{t('languageSettings.feedLanguage')}</label>
              <select id="feed-language" value={preferredContentLanguage} onChange={(event) => { setPreferredContentLanguage(event.target.value); setContentLanguageSaved(false); }} className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]">
                <option value="">{t('languageSettings.followInterface')}</option>
                {siteProfile.contentLanguages.map((item) => <option key={item} value={item}>{localeNames[item]}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={saveContentLanguage} disabled={contentLanguageSaving} className="btn btn-primary">{contentLanguageSaving ? t('languageSettings.saving') : t('languageSettings.save')}</button>
            {contentLanguageSaved && <span role="status" className="text-sm text-success">{t('languageSettings.saved')}</span>}
          </div>
        </section>}

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
          <Link href="#message-privacy" className="rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]">
            {t('messagePrivacy.title')}
          </Link>
          {cloudSavesEnabled && <Link
            href="/settings/cloud-saves"
            className="rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text)]"
          >
            {t('cloudSaves.title')}
          </Link>}
        </nav>

        <section id="message-privacy" className="card mb-6 p-6" aria-labelledby="message-privacy-title">
          <h2 id="message-privacy-title" className="text-lg font-semibold">{t('messagePrivacy.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('messagePrivacy.description')}</p>
          {messagePrivacyError && <p role="alert" className="mt-3 text-sm text-red-600">{messagePrivacyError}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label htmlFor="allow-messages" className="text-sm font-medium">{t('messagePrivacy.allowMessages')}</label>
            <select
              id="allow-messages"
              value={messagePrivacy}
              disabled={messagePrivacyLoading || messagePrivacySaving}
              onChange={(event) => { const value = event.target.value as MessagePrivacy; setMessagePrivacy(value); updateSocialPrivacy('allow_messages', value); setMessagePrivacySaved(false); }}
              className="min-h-11 min-w-40 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)]"
            >
              {(['everyone', 'friends', 'nobody'] as const).map((value) => <option key={value} value={value}>{t(`messagePrivacy.${value}`)}</option>)}
            </select>
            <button type="button" onClick={saveMessagePrivacy} disabled={messagePrivacyLoading || messagePrivacySaving} className="btn btn-primary min-h-11">
              {messagePrivacySaving ? t('messagePrivacy.saving') : t('messagePrivacy.save')}
            </button>
            {messagePrivacySaved && <span role="status" className="text-sm text-success">{t('messagePrivacy.saved')}</span>}
          </div>
        </section>

        <section id="activity-privacy" className="card mb-6 p-6" aria-labelledby="social-privacy-title">
          <h2 id="social-privacy-title" className="text-lg font-semibold">{t('socialPrivacy.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('socialPrivacy.description')}</p>
          {socialPrivacyError && <p role="alert" className="mt-3 text-sm text-red-600">{socialPrivacyError}</p>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">{t('socialPrivacy.status')}
              <select value={socialPrivacy.status} disabled={socialPrivacyLoading || socialPrivacySaving}
                onChange={(event) => updateSocialPrivacy('status', event.target.value as PresenceStatus)}
                className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm">
                {(['online', 'idle', 'dnd', 'invisible'] as const).map((value) => <option key={value} value={value}>{t(`socialPrivacy.${value}`)}</option>)}
              </select>
            </label>
            {(['presence_visibility', 'activity_visibility', 'allow_join', 'allow_join_request', 'allow_invites'] as const).map((key) => (
              <label key={key} className="text-sm font-medium">{t(`socialPrivacy.${key}`)}
                <select value={socialPrivacy[key]} disabled={socialPrivacyLoading || socialPrivacySaving}
                  onChange={(event) => updateSocialPrivacy(key, event.target.value as MessagePrivacy)}
                  className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm">
                  {(['everyone', 'friends', 'nobody'] as const).map((value) => <option key={value} value={value}>{t(`socialPrivacy.${value}`)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <label className="mt-4 flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={socialPrivacy.show_last_seen} disabled={socialPrivacyLoading || socialPrivacySaving}
              onChange={(event) => updateSocialPrivacy('show_last_seen', event.target.checked)} className="h-5 w-5" />
            {t('socialPrivacy.showLastSeen')}
          </label>
          <div className="mt-4 flex min-h-11 items-center gap-3">
            <button type="button" onClick={saveSocialPrivacy} disabled={socialPrivacyLoading || socialPrivacySaving} className="btn btn-primary min-h-11">
              {socialPrivacySaving ? t('socialPrivacy.saving') : t('socialPrivacy.save')}
            </button>
            {socialPrivacySaved && <span role="status" className="text-sm text-success">{t('socialPrivacy.saved')}</span>}
          </div>
        </section>

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

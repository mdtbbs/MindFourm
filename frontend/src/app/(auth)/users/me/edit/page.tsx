'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { userApi } from '@/lib/api/client';
import { UserProfile } from '@/types';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import AvatarUploader from '@/components/forum/avatar-uploader';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { ArrowLeft, Bell } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/i18n/provider';

export default function ProfileEditPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(() => {
    setError(null);
    userApi.getMyProfile()
      .then((data) => {
        setProfile(data);
        setUsername(data.username || '');
        setBio(data.bio || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('profileEdit.loadFailed')));
  }, [t]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSave = async () => {
    const trimmed = username.trim();
    if (!trimmed) { setError(t('profileEdit.emptyName')); return; }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // Submit the trimmed value that was validated, not the raw input.
      const updated = await userApi.updateProfile({ username: trimmed, bio });
      setProfile(updated);
      setMessage(t('profileEdit.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profileEdit.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.append('avatar', file);
    const result = await userApi.uploadAvatar(formData);
    setProfile(result);
    if (result.avatar_status === 'pending') {
      setMessage(t('profileEdit.avatarPending'));
    } else if (result.avatar_status === 'approved') {
      setMessage(t('profileEdit.avatarUpdated'));
    }
  };

  const handleAvatarRemove = async () => {
    setError(null);
    setMessage(null);
    const result = await userApi.removeAvatar();
    setProfile(result);
    setMessage(t('profileEdit.avatarRemoved'));
  };

  // The error branch has to come first: gating solely on `profile === null` meant a
  // failed load spun forever and the error state was never rendered.
  if (!profile && error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <Alert type="error" message={error} />
        <button
          type="button"
          onClick={loadProfile}
          className="text-sm text-[var(--primary-text)] underline"
        >
          {t('profileEdit.retry')}
        </button>
      </div>
    );
  }

  if (!profile) {
    return <div className="max-w-2xl mx-auto px-4 py-8 flex justify-center"><LoadingSpinner variant="orbital" size="lg" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text)]" aria-label={t('profileEdit.back')}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text)]">{t('profileEdit.title')}</h1>
      </div>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-6 space-y-6">
        <div className="flex flex-col items-center pb-6 border-b border-[var(--border-light)] dark:border-gray-800">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-4 self-start">{t('profileEdit.avatar')}</h2>
          <AvatarUploader
            currentAvatar={profile.avatar_url}
            onUpload={handleAvatarUpload}
            onRemove={handleAvatarRemove}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t('profileEdit.displayName')}</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={30}
            className="w-full px-3 py-2 border border-[var(--border)] dark:border-gray-600 rounded-lg text-sm bg-[var(--bg)] dark:bg-gray-800 text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            placeholder={t('profileEdit.displayNamePlaceholder')}
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">{username.length}/30</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--text)] mb-2">{t('profileEdit.bio')}</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={4}
            className="w-full px-3 py-2 border border-[var(--border)] dark:border-gray-600 rounded-lg text-sm bg-[var(--bg)] dark:bg-gray-800 text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] resize-none"
            placeholder={t('profileEdit.bioPlaceholder')}
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">{bio.length}/500</p>
        </div>

        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div className="flex gap-3 justify-end pt-4 border-t border-[var(--border-light)] dark:border-gray-800">
          <Link href="/settings" className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--primary-text)] transition-colors mr-auto">
            <Bell className="w-4 h-4" />
            {t('profileEdit.notificationSettings')}
          </Link>
          <Button variant="ghost" onClick={() => router.back()}>{t('profileEdit.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('profileEdit.saving') : t('profileEdit.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

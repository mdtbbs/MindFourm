'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { userApi } from '@/lib/api/client';
import { UserProfile } from '@/types';
import Alert from '@/components/ui/alert';
import Button from '@/components/ui/button';
import AvatarUploader from '@/components/forum/avatar-uploader';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { ArrowLeft, Bell } from 'lucide-react';
import Link from 'next/link';

export default function ProfileEditPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    userApi.getMyProfile()
      .then((data) => {
        setProfile(data);
        setUsername(data.username || '');
        setBio(data.bio || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'));
  }, []);

  const handleSave = async () => {
    const trimmed = username.trim();
    if (!trimmed) { setError('昵称不能为空'); return; }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await userApi.updateProfile({ username, bio });
      setProfile(updated);
      setMessage('资料已保存');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    const result = await userApi.uploadAvatar(formData);
    if (!result?.avatar_url) throw new Error('上传失败：服务器未返回头像URL');
    setProfile((prev) => prev ? { ...prev, avatar_url: result.avatar_url } : null);
  };

  const handleAvatarRemove = async () => {
    await userApi.removeAvatar();
    setProfile((prev) => prev ? { ...prev, avatar_url: null } : null);
  };

  if (!profile) {
    return <div className="max-w-2xl mx-auto px-4 py-8 flex justify-center"><LoadingSpinner variant="orbital" size="lg" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text)]" aria-label="返回上一页">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-[var(--text)]">编辑资料</h1>
      </div>

      <div className="bg-[var(--bg-card)] dark:bg-gray-900 rounded-lg border border-[var(--border)] dark:border-gray-700 p-6 space-y-6">
        <div className="flex flex-col items-center pb-6 border-b border-[var(--border-light)] dark:border-gray-800">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-4 self-start">头像</h2>
          <AvatarUploader
            currentAvatar={profile.avatar_url}
            onUpload={handleAvatarUpload}
            onRemove={handleAvatarRemove}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--text)] mb-2">昵称</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={30}
            className="w-full px-3 py-2 border border-[var(--border)] dark:border-gray-600 rounded-lg text-sm bg-[var(--bg)] dark:bg-gray-800 text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
            placeholder="输入昵称"
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">{username.length}/30</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--text)] mb-2">个人简介</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={4}
            className="w-full px-3 py-2 border border-[var(--border)] dark:border-gray-600 rounded-lg text-sm bg-[var(--bg)] dark:bg-gray-800 text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] resize-none"
            placeholder="介绍一下自己..."
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">{bio.length}/500</p>
        </div>

        {message && <Alert type="success" message={message} />}
        {error && <Alert type="error" message={error} />}

        <div className="flex gap-3 justify-end pt-4 border-t border-[var(--border-light)] dark:border-gray-800">
          <Link href="/settings" className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors mr-auto">
            <Bell className="w-4 h-4" />
            通知设置
          </Link>
          <Button variant="ghost" onClick={() => router.back()}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
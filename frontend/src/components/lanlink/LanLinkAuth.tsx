'use client';

import { useState } from 'react';
import { lanlinkClient, type LanLinkUser } from '@/lib/api/lanlinkClient';
import { useI18n } from '@/i18n/provider';

interface LanLinkAuthProps {
  onLogin: (user: LanLinkUser) => void;
}

export default function LanLinkAuth({ onLogin }: LanLinkAuthProps) {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setLoading(true);
    setError(null);
    try {
      const result = await lanlinkClient.login(username.trim(), password);
      if (result.ok && result.user) {
        onLogin(result.user);
      } else {
        setError(result.message || t('lanlink.authFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lanlink.authNetworkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6 max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-2">{t('lanlink.authTitle')}</h2>
      <p className="text-muted-foreground text-sm mb-4">
        {t('lanlink.authDescription')}
      </p>
      <form onSubmit={handleLogin} className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">{t('lanlink.authUsername')}</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder={t('lanlink.authUsernamePlaceholder')}
            autoComplete="username"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('lanlink.authPassword')}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder={t('lanlink.authPasswordPlaceholder')}
            autoComplete="current-password"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || !username.trim() || !password}
          className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? t('lanlink.authLoggingIn') : t('lanlink.authLogin')}
        </button>
      </form>
    </div>
  );
}

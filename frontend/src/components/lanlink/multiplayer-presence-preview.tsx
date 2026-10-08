'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth/context';
import { useI18n } from '@/i18n/provider';
import { socialPresenceApi, type SocialFriendPresenceItem } from '@/lib/api/client';

export default function MultiplayerPresencePreview() {
  const { user, isAuthenticated } = useAuth();
  const { t } = useI18n();
  const [friends, setFriends] = useState<SocialFriendPresenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated || !user) { setFriends([]); setLoading(false); setError(false); return; }
    setLoading(true);
    setError(false);
    try {
      const response = await socialPresenceApi.getFriends(1, 50);
      setFriends(response.data || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onRealtime = (event: Event) => {
      const message = (event as CustomEvent<{ event?: string; type?: string }>).detail;
      if (message?.type === 'resume_failed' || message?.event?.startsWith('friend.')
        || message?.event?.startsWith('presence.') || message?.event?.startsWith('activity.')) void load();
    };
    window.addEventListener('forum:realtime', onRealtime);
    return () => window.removeEventListener('forum:realtime', onRealtime);
  }, [load]);

  const online = friends.filter((friend) => friend.presence.status !== 'offline');

  return <section aria-labelledby="multiplayer-presence-title" className="border-y border-[var(--border)] py-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="multiplayer-presence-title" className="flex items-center gap-2 text-lg font-semibold text-[var(--text)]"><Users className="h-5 w-5 text-[var(--primary-text)]" aria-hidden="true" />{t('multiplayer.friendsOnline')}</h2><p className="mt-1 text-sm text-[var(--text-secondary)]">{t('multiplayer.friendsOnlineDescription')}</p></div>
      {isAuthenticated && <button type="button" onClick={() => void load()} aria-label={t('common.retry')} className="inline-flex min-h-11 items-center gap-2 border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"><RefreshCw className="h-4 w-4" aria-hidden="true" />{t('common.retry')}</button>}
    </div>
    {!isAuthenticated ? <p className="mt-4 text-sm text-[var(--text-muted)]"><Link href="/login?redirect=%2Fmultiplayer" className="text-[var(--primary-text)] hover:underline">{t('multiplayer.signInForPresence')}</Link></p>
      : loading ? <p className="mt-4 animate-pulse text-sm text-[var(--text-muted)]" aria-live="polite">{t('common.loading')}</p>
        : error ? <p role="alert" className="mt-4 text-sm text-[var(--text-secondary)]">{t('multiplayer.presenceLoadFailed')}</p>
          : online.length ? <ul className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">{online.slice(0, 8).map((friend) => <li key={friend.user.id} className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-2"><Link href={`/users/${friend.user.id}`} className="font-medium text-[var(--text)] hover:text-[var(--primary-text)]">{friend.user.username}</Link><span className="text-xs text-[var(--text-muted)]">{friend.activity?.name || t('multiplayer.online')}</span>{friend.actions.can_join && <Link href="/friends" className="text-xs font-medium text-[var(--primary-text)] hover:underline">{t('multiplayer.joinFromFriends')}</Link>}</li>)}</ul>
            : <p className="mt-4 text-sm text-[var(--text-muted)]">{t('multiplayer.noFriendsOnline')}</p>}
    <Link href="/friends" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-[var(--primary-text)] hover:underline">{t('navigation.friends')}</Link>
  </section>;
}

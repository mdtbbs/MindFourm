'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { friendsApi, multiplayerApi, socialPresenceApi, userBlocksApi, type IncomingJoinRequest, type SocialFriendPresenceItem } from '@/lib/api/client';
import FriendRequests from '@/components/lanlink/FriendRequests';
import { confirmDialog } from '@/store/interaction-dialog-store';
import {
  ackForumRealtimeEvent,
  readApprovalIntentId,
  subscribeForumRealtimeSession,
  type ForumRealtimeMessage,
} from '@/hooks/use-forum-realtime';
import { useAuth } from '@/lib/auth/context';
import { useI18n } from '@/i18n/provider';
import { V1ApiError, handleV1Unauthorized } from '@/lib/api/v1/transport';
import { useUserStore } from '@/store/user-store';

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Map a multiplayer V1 failure to a user-facing string via stable error.code. */
function resolveMultiplayerError(error: unknown, t: Translate, fallbackKey: string): string {
  if (error instanceof V1ApiError) {
    if (error.status === 401) return t('errors.AUTH_REQUIRED');
    if (error.code) {
      const key = `errors.${error.code}`;
      const translated = t(key);
      if (translated !== key) return translated;
    }
  }
  return t(fallbackKey);
}

type Tab = 'all' | 'online' | 'pending' | 'blocked';

function lastSeenLabel(t: Translate, timestamp?: number) {
  if (!timestamp) return t('friends.offline');
  const age = Math.max(0, Date.now() - timestamp * 1000);
  if (age < 60_000) return t('friends.lastSeenJustNow');
  if (age < 3_600_000) return t('friends.lastSeenMinutes', { count: Math.floor(age / 60_000) });
  if (age < 86_400_000) return t('friends.lastSeenHours', { count: Math.floor(age / 3_600_000) });
  return t('friends.lastSeenDays', { count: Math.floor(age / 86_400_000) });
}

function activityDuration(t: Translate, startedAt?: number) {
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - startedAt));
  if (seconds < 60) return t('friends.durationSeconds', { count: seconds });
  if (seconds < 3600) return t('friends.durationMinutes', { count: Math.floor(seconds / 60) });
  return t('friends.durationHours', { hours: Math.floor(seconds / 3600), minutes: Math.floor((seconds % 3600) / 60) });
}

export default function FriendsList() {
  const { user } = useAuth();
  const { t } = useI18n();
  const refreshAuth = useUserStore((state) => state.refreshAuth);
  const [tab, setTab] = useState<Tab>('all');
  const [friends, setFriends] = useState<SocialFriendPresenceItem[]>([]);
  const [blocked, setBlocked] = useState<Array<{ id: number; user: { id: number; username: string; avatar_url: string | null } }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [cardUserId, setCardUserId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [invites, setInvites] = useState<Array<{ invite_id: string; session_id: string; sender_user_id: number; expires_at: string; session: { game_id: string; game_version?: string | null; activity_name?: string | null } | null }>>([]);
  const [joinRequests, setJoinRequests] = useState<IncomingJoinRequest[]>([]);
  const [approvals, setApprovals] = useState<Array<{ id: string; requestId: string; intentId: string; sessionId?: string }>>([]);
  const [joinRequestErrors, setJoinRequestErrors] = useState<Record<string, string>>({});
  const [busyActions, setBusyActions] = useState<Set<string>>(new Set());
  const [launcher, setLauncher] = useState<{ default_client_id: string | null; clients: Array<{ client_id: string; name: string; launch_uri_template: string | null }> }>({ default_client_id: null, clients: [] });

  const load = useCallback(async () => {
    setLoading(true);
    // Silently returning on a failed request made an empty "0 条邀请" list look
    // identical to a successful one. Collect every failure and report it.
    const failures: string[] = [];
    const settled = await Promise.allSettled([
      socialPresenceApi.getFriends(1, 50), userBlocksApi.list(1, 50), multiplayerApi.getPreferences(),
      friendsApi.getRequests(1, 50), multiplayerApi.listInvites(), multiplayerApi.listJoinRequests(),
    ]);
    const [presenceResult, blocksResult, preferencesResult, friendRequestsResult, invitesResult, joinRequestsResult] = settled;
    for (const result of settled) {
      if (result.status === 'rejected' && handleV1Unauthorized(result.reason, () => void refreshAuth())) {
        setError(t('common.sessionExpired'));
        setLoading(false);
        return;
      }
    }
    if (presenceResult.status === 'fulfilled') {
      const items = presenceResult.value.data || [];
      setFriends(items);
      // The viewer's own sessions surface as `invite_session_id`; subscribe so
      // session-scoped events (peer/candidate/relay/session.closed) reach the UI.
      for (const item of items) {
        if (item.actions.invite_session_id) subscribeForumRealtimeSession(user?.id ?? 0, item.actions.invite_session_id);
      }
    } else failures.push(t('friends.errorPresence'));
    if (blocksResult.status === 'fulfilled') setBlocked(blocksResult.value.data || []);
    else failures.push(t('friends.errorBlocks'));
    if (preferencesResult.status === 'fulfilled') setLauncher(preferencesResult.value);
    else failures.push(t('friends.errorPreferences'));
    if (friendRequestsResult.status === 'fulfilled') setFriendRequestCount(friendRequestsResult.value.total || 0);
    // Pending counts drive the tab badge; a silent failure would read as zero pending.
    else failures.push(t('friends.errorFriendRequests'));
    if (invitesResult.status === 'fulfilled') setInvites(invitesResult.value);
    else failures.push(t('friends.errorInvites'));
    if (joinRequestsResult.status === 'fulfilled') setJoinRequests(joinRequestsResult.value.data || []);
    else failures.push(t('friends.errorJoinRequests'));
    setError(failures.length ? t('friends.errorPartialLoad', { sections: failures.join(t('common.listSeparator')) }) : '');
    setLoading(false);
  }, [user?.id, refreshAuth, t]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const handleRealtime = (event: Event) => {
      const message = (event as CustomEvent<ForumRealtimeMessage>).detail;
      if (!message) return;
      const isApproval = message.event === 'multiplayer.join_request.approved';
      // The approval event is a durable outbox row that is replayed with a new
      // id every 5 seconds until the client ACKs it. Refreshing six endpoints on
      // every replay turned that into a permanent request storm, and the old
      // `message.id` dedupe missed every replay because the id changes. The
      // intent (not the event id) is what must be shown once per request.
      if (message.type === 'resume_failed' || (!isApproval && message.event?.startsWith('multiplayer.'))
        || message.event?.startsWith('friend.') || message.event?.startsWith('presence.')
        || message.event?.startsWith('activity.')) void load();
      if (!isApproval) return;
      const requestId = typeof message.data?.join_request_id === 'string' ? message.data.join_request_id : '';
      const intentId = readApprovalIntentId(message.data);
      if (!requestId || !intentId) return;
      // The server replays this approval under a fresh event id every few seconds
      // until it is acknowledged, so dedup on the stable requestId, not the id.
      setApprovals((current) => current.some((item) => item.requestId === requestId) ? current : [...current, {
        id: message.id ?? requestId, requestId, intentId,
        sessionId: typeof message.data?.session_id === 'string' ? message.data.session_id : undefined,
      }]);
    };
    window.addEventListener('forum:realtime', handleRealtime);
    return () => window.removeEventListener('forum:realtime', handleRealtime);
  }, [load]);

  // `session:*` events are only pushed to sockets that subscribed to the
  // session, and an approved request means the user is about to join it.
  useEffect(() => {
    if (!user) return;
    for (const approval of approvals) {
      if (approval.sessionId) subscribeForumRealtimeSession(user.id, approval.sessionId);
    }
  }, [approvals, user]);

  const markBusy = (id: number, value: boolean) => setBusy((current) => {
    const next = new Set(current);
    value ? next.add(id) : next.delete(id);
    return next;
  });

  const removeFriend = async (userId: number) => {
    if (!await confirmDialog({ message: t('friends.removeFriendConfirm'), destructive: true })) return;
    markBusy(userId, true);
    try { await friendsApi.removeFriend(userId); setFriends((items) => items.filter((item) => item.user.id !== userId)); }
    catch (reason) { setError(resolveMultiplayerError(reason, t, 'friends.errorRemoveFriend')); }
    finally { markBusy(userId, false); }
  };

  const unblock = async (userId: number) => {
    markBusy(userId, true);
    try { await userBlocksApi.unblock(userId); setBlocked((items) => items.filter((item) => item.user.id !== userId)); }
    catch (reason) { setError(resolveMultiplayerError(reason, t, 'friends.errorUnblock')); }
    finally { markBusy(userId, false); }
  };

  const makeJoinIntent = async (item: SocialFriendPresenceItem) => {
    const sessionId = item.activity?.join?.session_id;
    if (!sessionId) return;
    markBusy(item.user.id, true);
    try {
      const intent = await multiplayerApi.createJoinIntent(sessionId);
      const selected = launcher.clients.find((client) => client.client_id === launcher.default_client_id);
      if (selected?.launch_uri_template) {
        const launchUri = selected.launch_uri_template.replace('{intent_id}', encodeURIComponent(intent.intent_id));
        window.location.assign(launchUri);
        setNotice(t('friends.noticeOpeningLauncher', { client: selected.name, label: t('friends.labelInvite') }));
      } else {
        setNotice(t('friends.noticeIntentCopied', { intent: intent.intent_id, seconds: intent.expires_in }));
      }
      try { await navigator.clipboard.writeText(intent.intent_id); } catch { /* Clipboard may be unavailable. */ }
    } catch (reason) { setError(resolveMultiplayerError(reason, t, 'friends.errorJoin')); }
    finally { markBusy(item.user.id, false); }
  };

  const requestJoin = async (item: SocialFriendPresenceItem) => {
    const sessionId = item.activity?.join?.session_id;
    if (!sessionId) return;
    markBusy(item.user.id, true);
    try { await multiplayerApi.requestJoin(sessionId); setNotice(t('friends.noticeInviteSent', { name: item.user.username })); }
    catch (reason) { setError(resolveMultiplayerError(reason, t, 'friends.errorRequestJoin')); }
    finally { markBusy(item.user.id, false); }
  };

  const invite = async (item: SocialFriendPresenceItem) => {
    const sessionId = item.actions.invite_session_id;
    if (!sessionId) return;
    markBusy(item.user.id, true);
    try { await multiplayerApi.invite(sessionId, item.user.id); setNotice(t('friends.noticeInvited', { name: item.user.username })); }
    catch (reason) { setError(resolveMultiplayerError(reason, t, 'friends.errorInvite')); }
    finally { markBusy(item.user.id, false); }
  };

  const markActionBusy = (id: string, value: boolean) => setBusyActions((current) => {
    const next = new Set(current);
    value ? next.add(id) : next.delete(id);
    return next;
  });

  const launchIntent = async (intent: { intent_id: string; expires_in: number }, label: string) => {
    const selected = launcher.clients.find((client) => client.client_id === launcher.default_client_id);
    if (selected?.launch_uri_template) {
      window.location.assign(selected.launch_uri_template.replace('{intent_id}', encodeURIComponent(intent.intent_id)));
      setNotice(t('friends.noticeOpeningLauncher', { client: selected.name, label }));
    } else {
      setNotice(t('friends.noticeIntentReady', { label, seconds: intent.expires_in }));
    }
    try { await navigator.clipboard.writeText(intent.intent_id); } catch { /* Clipboard may be unavailable. */ }
  };

  const acceptInvite = async (inviteId: string) => {
    markActionBusy(inviteId, true);
    try {
      const accepted = await multiplayerApi.acceptInvite(inviteId);
      await launchIntent(accepted.join_intent, t('friends.labelInvite'));
      await load();
    } catch (reason) { setError(resolveMultiplayerError(reason, t, 'friends.errorAcceptInvite')); }
    finally { markActionBusy(inviteId, false); }
  };

  const declineInvite = async (inviteId: string) => {
    markActionBusy(inviteId, true);
    try { await multiplayerApi.declineInvite(inviteId); await load(); }
    catch (reason) { setError(resolveMultiplayerError(reason, t, 'friends.errorDeclineInvite')); }
    finally { markActionBusy(inviteId, false); }
  };

  const approveJoinRequest = async (requestId: string) => {
    markActionBusy(requestId, true);
    setJoinRequestErrors((current) => {
      if (!(requestId in current)) return current;
      const next = { ...current };
      delete next[requestId];
      return next;
    });
    try {
      const approved = await multiplayerApi.approveJoinRequest(requestId);
      setNotice(t('friends.noticeApproved', { seconds: approved.join_intent.expires_in }));
      // The approved session is where this user's own session events will land.
      const approvedSessionId = joinRequests.find((item) => item.id === requestId)?.session_id;
      if (user && approvedSessionId) subscribeForumRealtimeSession(user.id, approvedSessionId);
      await load();
    } catch (reason) {
      // Keep the failure attached to the row: a shared string slot let one
      // failing approval overwrite an unrelated notice.
      if (handleV1Unauthorized(reason, () => void refreshAuth())) {
        setError(t('common.sessionExpired'));
      } else {
        setJoinRequestErrors((current) => ({ ...current, [requestId]: resolveMultiplayerError(reason, t, 'friends.errorApprove') }));
      }
    }
    finally { markActionBusy(requestId, false); }
  };

  const rejectJoinRequest = async (requestId: string) => {
    markActionBusy(requestId, true);
    try { await multiplayerApi.rejectJoinRequest(requestId); await load(); }
    catch (reason) { setError(resolveMultiplayerError(reason, t, 'friends.errorReject')); }
    finally { markActionBusy(requestId, false); }
  };

  const handoffApproval = async (approval: { id: string; requestId: string; intentId: string }) => {
    markActionBusy(approval.requestId, true);
    try {
      const selected = launcher.clients.find((client) => client.client_id === launcher.default_client_id);
      try { await navigator.clipboard.writeText(approval.intentId); } catch { /* Clipboard may be unavailable. */ }
      if (!selected?.launch_uri_template) {
        setNotice(t('friends.noticeHandoffCopied', { intent: approval.intentId }));
        // No launcher to hand off to yet: keep the event pending so it replays
        // once the user configures a client and returns to Continue joining.
        return;
      }
      window.location.assign(selected.launch_uri_template.replace('{intent_id}', encodeURIComponent(approval.intentId)));
      // The web client does not consume the one-time intent; the launcher owns
      // that. Acknowledging here stops the server from replaying the approval,
      // and the user-scoped ACK is only valid once the intent has been handed off.
      setApprovals((current) => current.filter((item) => item.requestId !== approval.requestId));
      const acknowledged = user?.id ? ackForumRealtimeEvent(user.id, approval.id) : false;
      setNotice(acknowledged
        ? t('friends.noticeHandoffDone', { client: selected.name })
        : t('friends.noticeHandoffUnacked', { client: selected.name }));
    } catch (reason) { setError(resolveMultiplayerError(reason, t, 'friends.errorHandoff')); }
    finally { markActionBusy(approval.requestId, false); }
  };

  const dismissApproval = (approval: { requestId: string }) => {
    setApprovals((current) => current.filter((item) => item.requestId !== approval.requestId));
  };

  const onlineCount = friends.filter((item) => item.presence.status !== 'offline').length;
  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'all', label: t('friends.tabAll'), count: friends.length },
    { id: 'online', label: t('friends.tabOnline'), count: onlineCount },
    { id: 'pending', label: t('friends.tabPending'), count: friendRequestCount + invites.length + joinRequests.length + approvals.length },
    { id: 'blocked', label: t('friends.tabBlocked'), count: blocked.length },
  ];
  const visibleFriends = tab === 'online' ? friends.filter((item) => item.presence.status !== 'offline') : friends;

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border px-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{t('friends.heading')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('friends.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">{t('friends.defaultClient')}
              <select aria-label={t('friends.defaultClient')} value={launcher.default_client_id || ''} onChange={async (event) => {
                const value = event.target.value || null;
                try { await multiplayerApi.setDefaultClient(value); setLauncher((current) => ({ ...current, default_client_id: value })); }
                catch (err) { setError(resolveMultiplayerError(err, t, 'friends.errorDefaultClient')); }
              }} className="ml-2 min-h-11 rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground">
                <option value="">{t('friends.noDefaultClient')}</option>{launcher.clients.map((client) => <option key={client.client_id} value={client.client_id}>{client.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void load()} className="min-h-11 rounded border border-border px-3 py-1.5 text-sm hover:bg-muted">{t('friends.refresh')}</button>
          </div>
        </div>
        <nav aria-label={t('friends.views')} className="mt-4 flex gap-1 overflow-x-auto">
          {tabs.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}
              className={`min-h-11 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm ${tab === item.id ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {item.label}<span className="ml-1.5 text-xs opacity-70">{item.count}</span>
            </button>
          ))}
        </nav>
      </div>

      {error && <p role="alert" className="mx-4 mt-4 rounded bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {notice && <div role="status" className="mx-4 mt-4 rounded bg-primary/10 px-3 py-2 text-sm">{notice}<button type="button" className="ml-2 underline" onClick={() => setNotice('')}>{t('friends.closing')}</button></div>}
      {loading ? <div className="space-y-3 p-5" aria-label={t('friends.loadingFriends')}><div className="h-12 animate-pulse rounded bg-muted" /><div className="h-12 animate-pulse rounded bg-muted" /></div> : null}

      {!loading && tab === 'pending' && <div className="space-y-5 p-4">
        <FriendRequests onChanged={() => void load()} />
        <section aria-labelledby="incoming-invites-title">
          <h3 id="incoming-invites-title" className="mb-2 text-sm font-semibold">{t('friends.invitesTitle', { count: invites.length })}</h3>
          {invites.length === 0 ? <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">{t('friends.noInvites')}</p> : <ul className="space-y-2">
            {invites.map((item) => <li key={item.invite_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
              <span className="min-w-0 flex-1 text-sm">{t('friends.invitedYouTo', { id: item.sender_user_id, name: item.session?.activity_name || item.session?.game_id || t('friends.sessionFallback') })}{item.session?.game_version ? ` · ${item.session.game_version}` : ''}</span>
              <button type="button" disabled={busyActions.has(item.invite_id)} onClick={() => void acceptInvite(item.invite_id)} className="min-h-11 rounded bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">{t('friends.acceptAndJoin')}</button>
              <button type="button" disabled={busyActions.has(item.invite_id)} onClick={() => void declineInvite(item.invite_id)} className="min-h-11 rounded border border-border px-3 text-sm disabled:opacity-50">{t('friends.decline')}</button>
            </li>)}
          </ul>}
        </section>
        <section aria-labelledby="incoming-join-requests-title">
          <h3 id="incoming-join-requests-title" className="mb-2 text-sm font-semibold">{t('friends.joinRequestsTitle', { count: joinRequests.length })}</h3>
          {joinRequests.length === 0 ? <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">{t('friends.noJoinRequests')}</p> : <ul className="space-y-2">
            {joinRequests.map((item) => <li key={item.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-3">
                {item.requester ? <Link href={`/users/${item.requester.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  {item.requester.avatar_url ? <img src={item.requester.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted font-semibold">{item.requester.username.slice(0, 1).toUpperCase()}</span>}
                  <span className="truncate text-sm">{t('friends.requestedToJoin', { name: item.requester.username, session: item.session?.activity_name || item.session?.game_id || t('friends.yourRoom') })}</span>
                </Link> : <span className="min-w-0 flex-1 text-sm">{t('friends.requestedToJoin', { name: t('friends.unknownUser'), session: item.session?.activity_name || item.session?.game_id || t('friends.yourRoom') })}</span>}
                <button type="button" disabled={busyActions.has(item.id)} onClick={() => void approveJoinRequest(item.id)} className="min-h-11 rounded bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">{t('friends.approve')}</button>
                <button type="button" disabled={busyActions.has(item.id)} onClick={() => void rejectJoinRequest(item.id)} className="min-h-11 rounded border border-border px-3 text-sm disabled:opacity-50">{t('friends.reject')}</button>
              </div>
              {joinRequestErrors[item.id] && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{joinRequestErrors[item.id]}</p>}
            </li>)}
          </ul>}
        </section>
        {approvals.length > 0 && <section aria-labelledby="approved-join-requests-title">
          <h3 id="approved-join-requests-title" className="mb-2 text-sm font-semibold">{t('friends.approvedTitle')}</h3>
          <ul className="space-y-2">{approvals.map((item) => <li key={item.requestId} className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <span className="min-w-0 flex-1 text-sm">{t('friends.yourRequestApproved')}{item.sessionId ? `（${item.sessionId}）` : ''}</span>
            <button type="button" disabled={busyActions.has(item.requestId)} onClick={() => void handoffApproval(item)} className="min-h-11 rounded bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">{t('friends.continueJoining')}</button>
            <button type="button" disabled={busyActions.has(item.requestId)} onClick={() => dismissApproval(item)} className="min-h-11 rounded border border-border px-3 text-sm disabled:opacity-50">{t('friends.dismiss')}</button>
          </li>)}</ul>
        </section>}
      </div>}

      {!loading && tab === 'blocked' && (
        <div className="divide-y divide-border">
          {blocked.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">{t('friends.noBlocked')}</p> : blocked.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link href={`/users/${item.user.id}`} className="flex min-w-0 items-center gap-3">
                {item.user.avatar_url ? <img src={item.user.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">{item.user.username.slice(0, 1).toUpperCase()}</span>}
                <span className="truncate text-sm font-medium">{item.user.username}</span>
              </Link>
              <button type="button" disabled={busy.has(item.user.id)} onClick={() => void unblock(item.user.id)} className="min-h-11 rounded border border-border px-3 text-xs hover:bg-muted disabled:opacity-50">{t('friends.unblock')}</button>
            </div>
          ))}
        </div>
      )}

      {!loading && (tab === 'all' || tab === 'online') && (
        visibleFriends.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{tab === 'online' ? t('friends.noFriendsOnline') : t('friends.noFriends')}</div> :
        <div className="divide-y divide-border">
          {visibleFriends.map((item) => {
            const friend = item.user;
            const activity = item.activity;
            const sessionId = activity?.join?.session_id;
            const statusLabel = item.presence.status === 'online' ? t('friends.online') : item.presence.status === 'idle' ? t('friends.idle') : item.presence.status === 'dnd' ? t('friends.dnd') : lastSeenLabel(t, item.presence.last_seen_at);
            const dot = item.presence.status === 'offline' ? 'bg-gray-400' : item.presence.status === 'dnd' ? 'bg-red-500' : item.presence.status === 'idle' ? 'bg-amber-400' : 'bg-green-500';
            return (
              <article key={friend.id} className="group flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/30">
                <Link href={`/users/${friend.id}`} className="flex min-w-[12rem] flex-1 items-center gap-3">
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                    {friend.avatar_url ? <img src={friend.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : friend.username.slice(0, 1).toUpperCase()}<i aria-label={statusLabel} className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${dot}`} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{friend.username}</span>
                  {activity ? <span className="block truncate text-xs text-muted-foreground">{activity.name}{activity.details ? ` · ${activity.details}` : ''}{activity.party?.current !== undefined ? ` · ${t('friends.partySize', { current: activity.party.current, max: activity.party.max !== undefined ? ` / ${activity.party.max}` : '' })}` : ''}</span>
                      : <span className="block truncate text-xs text-muted-foreground">{statusLabel}</span>}
                  </span>
                </Link>
                {activity && <span className="max-w-full truncate text-xs text-muted-foreground" title={activity.client?.name || activity.client_id}>{t('friends.byClient', { client: activity.client?.name || activity.client_id })}{activity.client?.developer_name ? `（${activity.client.developer_name}）` : ''} · {activity.platform}{activity.game?.version ? ` · ${activity.game.version}` : ''}</span>}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Link href={`/messages/${friend.id}`} className="inline-flex min-h-11 items-center rounded border border-border px-3 text-xs hover:bg-muted">{t('friends.sendMessage')}</Link>
                  <button type="button" aria-expanded={cardUserId === friend.id} aria-controls={`friend-card-${friend.id}`}
                    onClick={() => setCardUserId((current) => current === friend.id ? null : friend.id)}
                    className="min-h-11 rounded border border-border px-3 text-xs hover:bg-muted">{t('friends.multiplayerProfile')}</button>
                  {item.actions.can_join && sessionId && <button type="button" disabled={busy.has(friend.id)} onClick={() => void makeJoinIntent(item)} className="min-h-11 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50">{t('friends.joinGame')}</button>}
                  {item.actions.can_request_join && sessionId && <button type="button" disabled={busy.has(friend.id)} onClick={() => void requestJoin(item)} className="min-h-11 rounded border border-primary/40 px-3 text-xs text-primary disabled:opacity-50">{t('friends.requestJoin')}</button>}
                  {item.actions.can_invite && item.actions.invite_session_id && <button type="button" disabled={busy.has(friend.id)} onClick={() => void invite(item)} className="min-h-11 rounded border border-primary/40 px-3 text-xs text-primary disabled:opacity-50">{t('friends.inviteToRoom')}</button>}
                  <button type="button" disabled={busy.has(friend.id)} onClick={() => void removeFriend(friend.id)} className="min-h-11 rounded border border-border px-3 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">{t('friends.removeFriend')}</button>
                </div>
                <div id={`friend-card-${friend.id}`} role="region" aria-label={t('friends.profileLabel', { name: friend.username })}
                  className={`basis-full rounded-lg border border-border bg-background p-3 text-sm shadow-sm ${cardUserId === friend.id ? 'block' : 'hidden group-hover:block group-focus-within:block'}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    <span className="font-medium">{statusLabel}</span>
                    {item.presence.status === 'offline' && item.presence.last_seen_at && <span className="text-xs text-muted-foreground">{lastSeenLabel(t, item.presence.last_seen_at)}</span>}
                  </div>
                  {activity && <div className="mt-3 flex items-start gap-2">
                    {activity.client?.application_icon_url && <img src={activity.client.application_icon_url} alt="" className="h-7 w-7 rounded object-cover" />}
                    <div className="min-w-0">
                      <p className="font-medium">{activity.name}{activity.details ? ` · ${activity.details}` : ''}</p>
                      {activity.state && <p className="text-xs text-muted-foreground">{activity.state}</p>}
                      <p className="text-xs text-muted-foreground">
                        {activity.client?.name || activity.client_id} · {activity.client?.developer_name || t('friends.unknownDeveloper')} · {activity.platform}
                        {activity.game?.version ? ` · ${activity.game.version}` : ''}
                      </p>
                      {activity.party && <p className="text-xs text-muted-foreground">{t('friends.partySize', { current: activity.party.current ?? 0, max: activity.party.max !== undefined ? ` / ${activity.party.max}` : '' })}</p>}
                      {activityDuration(t, activity.timestamps?.started_at) && <p className="text-xs text-muted-foreground">{activityDuration(t, activity.timestamps?.started_at)}</p>}
                    </div>
                  </div>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.actions.can_join && sessionId && <button type="button" disabled={busy.has(friend.id)} onClick={() => void makeJoinIntent(item)} className="rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">{t('friends.joinGame')}</button>}
                    {item.actions.can_request_join && sessionId && <button type="button" disabled={busy.has(friend.id)} onClick={() => void requestJoin(item)} className="rounded border border-primary/40 px-2.5 py-1.5 text-xs text-primary disabled:opacity-50">{t('friends.requestJoin')}</button>}
                    {item.actions.can_invite && item.actions.invite_session_id && <button type="button" disabled={busy.has(friend.id)} onClick={() => void invite(item)} className="rounded border border-primary/40 px-2.5 py-1.5 text-xs text-primary disabled:opacity-50">{t('friends.inviteToRoom')}</button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

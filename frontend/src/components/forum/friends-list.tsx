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
import { handleV1Unauthorized, localizeV1Error } from '@/lib/api/v1/transport';
import { useAuth } from '@/lib/auth/context';
import { useUserStore } from '@/store/user-store';

type Tab = 'all' | 'online' | 'pending' | 'blocked';

function lastSeenLabel(timestamp?: number) {
  if (!timestamp) return '离线';
  const age = Math.max(0, Date.now() - timestamp * 1000);
  if (age < 60_000) return '刚刚在线';
  if (age < 3_600_000) return `${Math.floor(age / 60_000)} 分钟前在线`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)} 小时前在线`;
  return `${Math.floor(age / 86_400_000)} 天前在线`;
}

function activityDuration(startedAt?: number) {
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - startedAt));
  if (seconds < 60) return `持续 ${seconds} 秒`;
  if (seconds < 3600) return `持续 ${Math.floor(seconds / 60)} 分钟`;
  return `持续 ${Math.floor(seconds / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分钟`;
}

export default function FriendsList() {
  const { user } = useAuth();
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
        setLoading(false);
        return;
      }
    }
    if (presenceResult.status === 'fulfilled') setFriends(presenceResult.value.data || []);
    else failures.push('好友状态');
    if (blocksResult.status === 'fulfilled') setBlocked(blocksResult.value.data || []);
    else failures.push('屏蔽列表');
    if (preferencesResult.status === 'fulfilled') setLauncher(preferencesResult.value);
    else failures.push('联机客户端设置');
    if (friendRequestsResult.status === 'fulfilled') setFriendRequestCount(friendRequestsResult.value.total || 0);
    else failures.push('好友请求');
    if (invitesResult.status === 'fulfilled') setInvites(invitesResult.value);
    else failures.push('联机邀请');
    if (joinRequestsResult.status === 'fulfilled') setJoinRequests(joinRequestsResult.value.data || []);
    else failures.push('加入请求');
    setError(failures.length ? `${failures.join('、')}暂时无法加载，列表可能不完整。请稍后重试。` : '');
    setLoading(false);
  }, [refreshAuth]);

  const reportFailure = useCallback((reason: unknown, fallback: string) => {
    if (handleV1Unauthorized(reason, () => void refreshAuth())) {
      setError('登录状态已失效，请重新登录。');
      return;
    }
    setError(localizeV1Error(reason, fallback));
  }, [refreshAuth]);

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
      setApprovals((current) => current.some((item) => item.requestId === requestId) ? current : [...current, {
        id: requestId, requestId, intentId,
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
    if (!await confirmDialog({ message: '确定要删除这位好友吗？', destructive: true })) return;
    markBusy(userId, true);
    try { await friendsApi.removeFriend(userId); setFriends((items) => items.filter((item) => item.user.id !== userId)); }
    catch (reason) { reportFailure(reason, '删除好友失败，请重试。'); }
    finally { markBusy(userId, false); }
  };

  const unblock = async (userId: number) => {
    markBusy(userId, true);
    try { await userBlocksApi.unblock(userId); setBlocked((items) => items.filter((item) => item.user.id !== userId)); }
    catch (reason) { reportFailure(reason, '解除屏蔽失败，请重试。'); }
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
        setNotice(`正在通过 ${selected.name} 打开一次性加入凭证。`);
      } else {
        setNotice(`已创建一次性加入凭证 ${intent.intent_id}（${intent.expires_in} 秒内有效）。请先设置默认联机客户端，或在客户端中使用该 Intent。`);
      }
      try { await navigator.clipboard.writeText(intent.intent_id); } catch { /* Clipboard may be unavailable. */ }
      // The client owns the peer connection, so this browser socket only gets
      // peer/candidate/relay events after subscribing to the session.
      if (user) subscribeForumRealtimeSession(user.id, sessionId);
    } catch (reason) { reportFailure(reason, '无法加入该房间，权限或房间状态可能已变化。'); }
    finally { markBusy(item.user.id, false); }
  };

  const requestJoin = async (item: SocialFriendPresenceItem) => {
    const sessionId = item.activity?.join?.session_id;
    if (!sessionId) return;
    markBusy(item.user.id, true);
    try { await multiplayerApi.requestJoin(sessionId); setNotice(`已向 ${item.user.username} 发送加入请求。`); }
    catch (reason) { reportFailure(reason, '发送加入请求失败，请重试。'); }
    finally { markBusy(item.user.id, false); }
  };

  const invite = async (item: SocialFriendPresenceItem) => {
    const sessionId = item.actions.invite_session_id;
    if (!sessionId) return;
    markBusy(item.user.id, true);
    try { await multiplayerApi.invite(sessionId, item.user.id); setNotice(`已邀请 ${item.user.username} 加入房间。`); }
    catch (reason) { reportFailure(reason, '发送联机邀请失败，请重试。'); }
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
      setNotice(`正在通过 ${selected.name} 打开 ${label}。`);
    } else {
      setNotice(`已获得 ${label}的一次性加入凭证，请在 ${intent.expires_in} 秒内使用；可先设置默认联机客户端。`);
    }
    try { await navigator.clipboard.writeText(intent.intent_id); } catch { /* Clipboard may be unavailable. */ }
  };

  const acceptInvite = async (inviteId: string) => {
    markActionBusy(inviteId, true);
    try {
      const accepted = await multiplayerApi.acceptInvite(inviteId);
      await launchIntent(accepted.join_intent, '联机邀请');
      await load();
    } catch (reason) { reportFailure(reason, '接受联机邀请失败，邀请或房间状态可能已变化。'); }
    finally { markActionBusy(inviteId, false); }
  };

  const declineInvite = async (inviteId: string) => {
    markActionBusy(inviteId, true);
    try { await multiplayerApi.declineInvite(inviteId); await load(); }
    catch (reason) { reportFailure(reason, '拒绝联机邀请失败，请重试。'); }
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
      setNotice(`已批准加入请求。请求者将收到一次性加入凭证（${approved.join_intent.expires_in} 秒内有效）。`);
      // The approved session is where this user's own session events will land.
      const approvedSessionId = joinRequests.find((item) => item.id === requestId)?.session_id;
      if (user && approvedSessionId) subscribeForumRealtimeSession(user.id, approvedSessionId);
      await load();
    } catch (reason) {
      // Keep the failure attached to the row: a shared string slot let one
      // failing approval overwrite an unrelated notice.
      if (handleV1Unauthorized(reason, () => void refreshAuth())) {
        setError('登录状态已失效，请重新登录。');
      } else {
        setJoinRequestErrors((current) => ({ ...current, [requestId]: localizeV1Error(reason, '批准加入请求失败，请求或房间状态可能已变化。') }));
      }
    }
    finally { markActionBusy(requestId, false); }
  };

  const rejectJoinRequest = async (requestId: string) => {
    markActionBusy(requestId, true);
    try { await multiplayerApi.rejectJoinRequest(requestId); await load(); }
    catch (reason) { reportFailure(reason, '拒绝加入请求失败，请重试。'); }
    finally { markActionBusy(requestId, false); }
  };

  const handoffApproval = async (approval: { id: string; requestId: string; intentId: string }) => {
    markActionBusy(approval.requestId, true);
    try {
      const selected = launcher.clients.find((client) => client.client_id === launcher.default_client_id);
      try { await navigator.clipboard.writeText(approval.intentId); } catch { /* Clipboard may be unavailable. */ }
      if (!selected?.launch_uri_template) {
        setNotice(`已复制一次性加入凭证 ${approval.intentId}。请先设置默认联机客户端，或在客户端中使用该 Intent。`);
        return;
      }
      window.location.assign(selected.launch_uri_template.replace('{intent_id}', encodeURIComponent(approval.intentId)));
      // The web client does not consume the one-time intent — the launcher does.
      // But leaving the event unacknowledged made the server replay it (and this
      // card) every 5 seconds forever. The handoff itself succeeded, so retire
      // the outbox row; a failed launch keeps it pending for a retry.
      if (user) ackForumRealtimeEvent(user.id, approval.id);
      setApprovals((current) => current.filter((item) => item.requestId !== approval.requestId));
      setNotice(`已将一次性加入凭证交给 ${selected.name}，由客户端完成加入。`);
    } catch { setError('无法打开联机客户端；加入凭证尚未被网页消费，可以重试。'); }
    finally { markActionBusy(approval.requestId, false); }
  };

  const dismissApproval = (approval: { requestId: string }) => {
    setApprovals((current) => current.filter((item) => item.requestId !== approval.requestId));
  };

  const onlineCount = friends.filter((item) => item.presence.status !== 'offline').length;
  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'all', label: '全部', count: friends.length },
    { id: 'online', label: '在线', count: onlineCount },
    { id: 'pending', label: '待处理', count: friendRequestCount + invites.length + joinRequests.length + approvals.length },
    { id: 'blocked', label: '已屏蔽', count: blocked.length },
  ];
  const visibleFriends = tab === 'online' ? friends.filter((item) => item.presence.status !== 'offline') : friends;

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border px-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">好友</h2>
            <p className="mt-1 text-sm text-muted-foreground">好友、在线状态与联机动作由 MDTBBS 社交策略统一提供。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">默认联机客户端
              <select aria-label="默认联机客户端" value={launcher.default_client_id || ''} onChange={async (event) => {
                const value = event.target.value || null;
                try { await multiplayerApi.setDefaultClient(value); setLauncher((current) => ({ ...current, default_client_id: value })); }
                catch { setError('保存默认联机客户端失败。'); }
              }} className="ml-2 min-h-11 rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground">
                <option value="">未设置</option>{launcher.clients.map((client) => <option key={client.client_id} value={client.client_id}>{client.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void load()} className="min-h-11 rounded border border-border px-3 py-1.5 text-sm hover:bg-muted">刷新</button>
          </div>
        </div>
        <nav aria-label="好友视图" className="mt-4 flex gap-1 overflow-x-auto">
          {tabs.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}
              className={`min-h-11 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm ${tab === item.id ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {item.label}<span className="ml-1.5 text-xs opacity-70">{item.count}</span>
            </button>
          ))}
        </nav>
      </div>

      {error && <p role="alert" className="mx-4 mt-4 rounded bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {notice && <div role="status" className="mx-4 mt-4 rounded bg-primary/10 px-3 py-2 text-sm">{notice}<button type="button" className="ml-2 underline" onClick={() => setNotice('')}>关闭</button></div>}
      {loading ? <div className="space-y-3 p-5" aria-label="正在加载好友"><div className="h-12 animate-pulse rounded bg-muted" /><div className="h-12 animate-pulse rounded bg-muted" /></div> : null}

      {!loading && tab === 'pending' && <div className="space-y-5 p-4">
        <FriendRequests onChanged={() => void load()} />
        <section aria-labelledby="incoming-invites-title">
          <h3 id="incoming-invites-title" className="mb-2 text-sm font-semibold">联机邀请（{invites.length}）</h3>
          {invites.length === 0 ? <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">没有待处理的联机邀请</p> : <ul className="space-y-2">
            {invites.map((item) => <li key={item.invite_id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
              <span className="min-w-0 flex-1 text-sm">用户 #{item.sender_user_id} 邀请你加入 {item.session?.activity_name || item.session?.game_id || '联机房间'}{item.session?.game_version ? ` · ${item.session.game_version}` : ''}</span>
              <button type="button" disabled={busyActions.has(item.invite_id)} onClick={() => void acceptInvite(item.invite_id)} className="min-h-11 rounded bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">接受并加入</button>
              <button type="button" disabled={busyActions.has(item.invite_id)} onClick={() => void declineInvite(item.invite_id)} className="min-h-11 rounded border border-border px-3 text-sm disabled:opacity-50">拒绝</button>
            </li>)}
          </ul>}
        </section>
        <section aria-labelledby="incoming-join-requests-title">
          <h3 id="incoming-join-requests-title" className="mb-2 text-sm font-semibold">加入请求（{joinRequests.length}）</h3>
          {joinRequests.length === 0 ? <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">没有待处理的加入请求</p> : <ul className="space-y-2">
            {joinRequests.map((item) => <li key={item.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-3">
                {item.requester ? <Link href={`/users/${item.requester.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  {item.requester.avatar_url ? <img src={item.requester.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted font-semibold">{item.requester.username.slice(0, 1).toUpperCase()}</span>}
                  <span className="truncate text-sm">{item.requester.username} 请求加入 {item.session?.activity_name || item.session?.game_id || '你的房间'}</span>
                </Link> : <span className="min-w-0 flex-1 text-sm">用户请求加入 {item.session?.activity_name || item.session?.game_id || '你的房间'}</span>}
                <button type="button" disabled={busyActions.has(item.id)} onClick={() => void approveJoinRequest(item.id)} className="min-h-11 rounded bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">批准</button>
                <button type="button" disabled={busyActions.has(item.id)} onClick={() => void rejectJoinRequest(item.id)} className="min-h-11 rounded border border-border px-3 text-sm disabled:opacity-50">拒绝</button>
              </div>
              {joinRequestErrors[item.id] && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{joinRequestErrors[item.id]}</p>}
            </li>)}
          </ul>}
        </section>
        {approvals.length > 0 && <section aria-labelledby="approved-join-requests-title">
          <h3 id="approved-join-requests-title" className="mb-2 text-sm font-semibold">已批准的加入请求</h3>
          <ul className="space-y-2">{approvals.map((item) => <li key={item.requestId} className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <span className="min-w-0 flex-1 text-sm">你的加入请求已批准{item.sessionId ? `（${item.sessionId}）` : ''}。</span>
            <button type="button" disabled={busyActions.has(item.requestId)} onClick={() => void handoffApproval(item)} className="min-h-11 rounded bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">继续加入</button>
            <button type="button" disabled={busyActions.has(item.requestId)} onClick={() => dismissApproval(item)} className="min-h-11 rounded border border-border px-3 text-sm disabled:opacity-50">稍后处理</button>
          </li>)}</ul>
        </section>}
      </div>}

      {!loading && tab === 'blocked' && (
        <div className="divide-y divide-border">
          {blocked.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">没有已屏蔽的用户</p> : blocked.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link href={`/users/${item.user.id}`} className="flex min-w-0 items-center gap-3">
                {item.user.avatar_url ? <img src={item.user.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">{item.user.username.slice(0, 1).toUpperCase()}</span>}
                <span className="truncate text-sm font-medium">{item.user.username}</span>
              </Link>
              <button type="button" disabled={busy.has(item.user.id)} onClick={() => void unblock(item.user.id)} className="min-h-11 rounded border border-border px-3 text-xs hover:bg-muted disabled:opacity-50">解除屏蔽</button>
            </div>
          ))}
        </div>
      )}

      {!loading && (tab === 'all' || tab === 'online') && (
        visibleFriends.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{tab === 'online' ? '目前没有在线好友' : '还没有好友，在下方搜索添加好友吧'}</div> :
        <div className="divide-y divide-border">
          {visibleFriends.map((item) => {
            const friend = item.user;
            const activity = item.activity;
            const sessionId = activity?.join?.session_id;
            const statusLabel = item.presence.status === 'online' ? '在线' : item.presence.status === 'idle' ? '离开' : item.presence.status === 'dnd' ? '请勿打扰' : lastSeenLabel(item.presence.last_seen_at);
            const dot = item.presence.status === 'offline' ? 'bg-gray-400' : item.presence.status === 'dnd' ? 'bg-red-500' : item.presence.status === 'idle' ? 'bg-amber-400' : 'bg-green-500';
            return (
              <article key={friend.id} className="group flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/30">
                <Link href={`/users/${friend.id}`} className="flex min-w-[12rem] flex-1 items-center gap-3">
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                    {friend.avatar_url ? <img src={friend.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : friend.username.slice(0, 1).toUpperCase()}<i aria-label={statusLabel} className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${dot}`} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{friend.username}</span>
                  {activity ? <span className="block truncate text-xs text-muted-foreground">{activity.name}{activity.details ? ` · ${activity.details}` : ''}{activity.party?.current !== undefined ? ` · ${activity.party.current}${activity.party.max !== undefined ? ` / ${activity.party.max}` : ''} 人` : ''}</span>
                      : <span className="block truncate text-xs text-muted-foreground">{statusLabel}</span>}
                  </span>
                </Link>
                {activity && <span className="max-w-full truncate text-xs text-muted-foreground" title={activity.client?.name || activity.client_id}>通过 {activity.client?.name || activity.client_id}{activity.client?.developer_name ? `（${activity.client.developer_name}）` : ''} · {activity.platform}{activity.game?.version ? ` · ${activity.game.version}` : ''}</span>}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Link href={`/messages/${friend.id}`} className="inline-flex min-h-11 items-center rounded border border-border px-3 text-xs hover:bg-muted">发消息</Link>
                  <button type="button" aria-expanded={cardUserId === friend.id} aria-controls={`friend-card-${friend.id}`}
                    onClick={() => setCardUserId((current) => current === friend.id ? null : friend.id)}
                    className="min-h-11 rounded border border-border px-3 text-xs hover:bg-muted">联机资料</button>
                  {item.actions.can_join && sessionId && <button type="button" disabled={busy.has(friend.id)} onClick={() => void makeJoinIntent(item)} className="min-h-11 rounded bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50">加入游戏</button>}
                  {item.actions.can_request_join && sessionId && <button type="button" disabled={busy.has(friend.id)} onClick={() => void requestJoin(item)} className="min-h-11 rounded border border-primary/40 px-3 text-xs text-primary disabled:opacity-50">请求加入</button>}
                  {item.actions.can_invite && item.actions.invite_session_id && <button type="button" disabled={busy.has(friend.id)} onClick={() => void invite(item)} className="min-h-11 rounded border border-primary/40 px-3 text-xs text-primary disabled:opacity-50">邀请加入我的房间</button>}
                  <button type="button" disabled={busy.has(friend.id)} onClick={() => void removeFriend(friend.id)} className="min-h-11 rounded border border-border px-3 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">删除好友</button>
                </div>
                <div id={`friend-card-${friend.id}`} role="region" aria-label={`${friend.username} 的联机资料`}
                  className={`basis-full rounded-lg border border-border bg-background p-3 text-sm shadow-sm ${cardUserId === friend.id ? 'block' : 'hidden group-hover:block group-focus-within:block'}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    <span className="font-medium">{statusLabel}</span>
                    {item.presence.status === 'offline' && item.presence.last_seen_at && <span className="text-xs text-muted-foreground">{lastSeenLabel(item.presence.last_seen_at)}</span>}
                  </div>
                  {activity && <div className="mt-3 flex items-start gap-2">
                    {activity.client?.application_icon_url && <img src={activity.client.application_icon_url} alt="" className="h-7 w-7 rounded object-cover" />}
                    <div className="min-w-0">
                      <p className="font-medium">{activity.name}{activity.details ? ` · ${activity.details}` : ''}</p>
                      {activity.state && <p className="text-xs text-muted-foreground">{activity.state}</p>}
                      <p className="text-xs text-muted-foreground">
                        {activity.client?.name || activity.client_id} · {activity.client?.developer_name || '未知开发者'} · {activity.platform}
                        {activity.game?.version ? ` · ${activity.game.version}` : ''}
                      </p>
                      {activity.party && <p className="text-xs text-muted-foreground">房间人数：{activity.party.current ?? 0}{activity.party.max !== undefined ? ` / ${activity.party.max}` : ''}</p>}
                      {activityDuration(activity.timestamps?.started_at) && <p className="text-xs text-muted-foreground">{activityDuration(activity.timestamps?.started_at)}</p>}
                    </div>
                  </div>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.actions.can_join && sessionId && <button type="button" disabled={busy.has(friend.id)} onClick={() => void makeJoinIntent(item)} className="rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">加入游戏</button>}
                    {item.actions.can_request_join && sessionId && <button type="button" disabled={busy.has(friend.id)} onClick={() => void requestJoin(item)} className="rounded border border-primary/40 px-2.5 py-1.5 text-xs text-primary disabled:opacity-50">请求加入</button>}
                    {item.actions.can_invite && item.actions.invite_session_id && <button type="button" disabled={busy.has(friend.id)} onClick={() => void invite(item)} className="rounded border border-primary/40 px-2.5 py-1.5 text-xs text-primary disabled:opacity-50">邀请加入我的房间</button>}
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

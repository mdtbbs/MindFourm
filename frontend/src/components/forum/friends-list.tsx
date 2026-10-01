'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { friendsApi, multiplayerApi, socialPresenceApi, userBlocksApi, type SocialFriendPresenceItem } from '@/lib/api/client';
import FriendRequests from '@/components/lanlink/FriendRequests';

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
  const [tab, setTab] = useState<Tab>('all');
  const [friends, setFriends] = useState<SocialFriendPresenceItem[]>([]);
  const [blocked, setBlocked] = useState<Array<{ id: number; user: { id: number; username: string; avatar_url: string | null } }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [cardUserId, setCardUserId] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [launcher, setLauncher] = useState<{ default_client_id: string | null; clients: Array<{ client_id: string; name: string; launch_uri_template: string | null }> }>({ default_client_id: null, clients: [] });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [presence, blocks, preferences] = await Promise.all([
        socialPresenceApi.getFriends(1, 50),
        userBlocksApi.list(1, 50),
        multiplayerApi.getPreferences(),
      ]);
      setFriends(presence.data || []);
      setBlocked(blocks.data || []);
      setLauncher(preferences);
    } catch {
      setError('好友状态暂时无法加载，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const markBusy = (id: number, value: boolean) => setBusy((current) => {
    const next = new Set(current);
    value ? next.add(id) : next.delete(id);
    return next;
  });

  const removeFriend = async (userId: number) => {
    if (!confirm('确定要删除这位好友吗？')) return;
    markBusy(userId, true);
    try { await friendsApi.removeFriend(userId); setFriends((items) => items.filter((item) => item.user.id !== userId)); }
    catch { setError('删除好友失败，请重试。'); }
    finally { markBusy(userId, false); }
  };

  const unblock = async (userId: number) => {
    markBusy(userId, true);
    try { await userBlocksApi.unblock(userId); setBlocked((items) => items.filter((item) => item.user.id !== userId)); }
    catch { setError('解除屏蔽失败，请重试。'); }
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
    } catch { setError('无法加入该房间，权限或房间状态可能已变化。'); }
    finally { markBusy(item.user.id, false); }
  };

  const requestJoin = async (item: SocialFriendPresenceItem) => {
    const sessionId = item.activity?.join?.session_id;
    if (!sessionId) return;
    markBusy(item.user.id, true);
    try { await multiplayerApi.requestJoin(sessionId); setNotice(`已向 ${item.user.username} 发送加入请求。`); }
    catch { setError('发送加入请求失败，请重试。'); }
    finally { markBusy(item.user.id, false); }
  };

  const invite = async (item: SocialFriendPresenceItem) => {
    const sessionId = item.actions.invite_session_id;
    if (!sessionId) return;
    markBusy(item.user.id, true);
    try { await multiplayerApi.invite(sessionId, item.user.id); setNotice(`已邀请 ${item.user.username} 加入房间。`); }
    catch { setError('发送联机邀请失败，请重试。'); }
    finally { markBusy(item.user.id, false); }
  };

  const onlineCount = friends.filter((item) => item.presence.status !== 'offline').length;
  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'all', label: '全部', count: friends.length },
    { id: 'online', label: '在线', count: onlineCount },
    { id: 'pending', label: '待处理', count: 0 },
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
              }} className="ml-2 rounded border border-border bg-background px-2 py-1.5 text-sm text-foreground">
                <option value="">未设置</option>{launcher.clients.map((client) => <option key={client.client_id} value={client.client_id}>{client.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void load()} className="rounded border border-border px-3 py-1.5 text-sm hover:bg-muted">刷新</button>
          </div>
        </div>
        <nav aria-label="好友视图" className="mt-4 flex gap-1 overflow-x-auto">
          {tabs.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}
              className={`whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm ${tab === item.id ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {item.label}<span className="ml-1.5 text-xs opacity-70">{item.count || (item.id === 'pending' ? '•' : '')}</span>
            </button>
          ))}
        </nav>
      </div>

      {error && <p role="alert" className="mx-4 mt-4 rounded bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {notice && <div role="status" className="mx-4 mt-4 rounded bg-primary/10 px-3 py-2 text-sm">{notice}<button type="button" className="ml-2 underline" onClick={() => setNotice('')}>关闭</button></div>}
      {loading ? <div className="space-y-3 p-5" aria-label="正在加载好友"><div className="h-12 animate-pulse rounded bg-muted" /><div className="h-12 animate-pulse rounded bg-muted" /></div> : null}

      {!loading && tab === 'pending' && <div className="p-4"><FriendRequests /></div>}

      {!loading && tab === 'blocked' && (
        <div className="divide-y divide-border">
          {blocked.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">没有已屏蔽的用户</p> : blocked.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <Link href={`/users/${item.user.id}`} className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">{item.user.username.slice(0, 1).toUpperCase()}</span>
                <span className="truncate text-sm font-medium">{item.user.username}</span>
              </Link>
              <button type="button" disabled={busy.has(item.user.id)} onClick={() => void unblock(item.user.id)} className="rounded border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-50">解除屏蔽</button>
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
                    {friend.username.slice(0, 1).toUpperCase()}<i aria-label={statusLabel} className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${dot}`} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{friend.username}</span>
                  {activity ? <span className="block truncate text-xs text-muted-foreground">{activity.name}{activity.details ? ` · ${activity.details}` : ''}{activity.party?.current !== undefined ? ` · ${activity.party.current}${activity.party.max !== undefined ? ` / ${activity.party.max}` : ''} 人` : ''}</span>
                      : <span className="block truncate text-xs text-muted-foreground">{statusLabel}</span>}
                  </span>
                </Link>
                {activity && <span className="max-w-full truncate text-xs text-muted-foreground" title={activity.client?.name || activity.client_id}>通过 {activity.client?.name || activity.client_id}{activity.client?.developer_name ? `（${activity.client.developer_name}）` : ''} · {activity.platform}{activity.game?.version ? ` · ${activity.game.version}` : ''}</span>}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <Link href={`/messages/${friend.id}`} className="rounded border border-border px-2.5 py-1.5 text-xs hover:bg-muted">发消息</Link>
                  <button type="button" aria-expanded={cardUserId === friend.id} aria-controls={`friend-card-${friend.id}`}
                    onClick={() => setCardUserId((current) => current === friend.id ? null : friend.id)}
                    className="rounded border border-border px-2.5 py-1.5 text-xs hover:bg-muted">联机资料</button>
                  {item.actions.can_join && sessionId && <button type="button" disabled={busy.has(friend.id)} onClick={() => void makeJoinIntent(item)} className="rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">加入游戏</button>}
                  {item.actions.can_request_join && sessionId && <button type="button" disabled={busy.has(friend.id)} onClick={() => void requestJoin(item)} className="rounded border border-primary/40 px-2.5 py-1.5 text-xs text-primary disabled:opacity-50">请求加入</button>}
                  {item.actions.can_invite && item.actions.invite_session_id && <button type="button" disabled={busy.has(friend.id)} onClick={() => void invite(item)} className="rounded border border-primary/40 px-2.5 py-1.5 text-xs text-primary disabled:opacity-50">邀请加入我的房间</button>}
                  <button type="button" disabled={busy.has(friend.id)} onClick={() => void removeFriend(friend.id)} className="rounded border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50">删除好友</button>
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

'use client';

import { useState, useEffect, useCallback } from 'react';
import { lanlinkClient, type LanLinkFriend } from '@/lib/api/lanlinkClient';
import Badge from '@/components/ui/badge';

const POLL_INTERVAL = 15000;

const STATUS_CONFIG: Record<string, { icon: string; label: string; variant: 'success' | 'primary' | 'warning' | 'default' }> = {
  hosting: { icon: '🎮', label: '开房中', variant: 'primary' },
  playing: { icon: '👥', label: '游戏中', variant: 'warning' },
  online: { icon: '🟢', label: '在线', variant: 'success' },
  offline: { icon: '⚫', label: '离线', variant: 'default' },
};

interface FriendsPanelProps {
  /** 当前用户是否正在开房（用于显示邀请按钮） */
  isHosting?: boolean;
  /** 当前用户的房间码（用于邀请） */
  myRoomCode?: string;
}

export default function FriendsPanel({ isHosting, myRoomCode }: FriendsPanelProps) {
  const [friends, setFriends] = useState<LanLinkFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [inviting, setInviting] = useState<Set<string>>(new Set());

  const fetchFriends = useCallback(async () => {
    try {
      const data = await lanlinkClient.getFriends();
      setFriends(data.friends || []);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.message !== 'login_required') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFriends();
    const timer = setInterval(fetchFriends, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchFriends]);

  const copyRoomCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      // fallback
    }
  };

  const inviteFriend = async (friendId: string) => {
    if (!myRoomCode) return;
    setInviting((prev) => new Set(prev).add(friendId));
    try {
      await lanlinkClient.sendInvite(myRoomCode, friendId);
    } catch {
      // toast could be added here
    } finally {
      setInviting((prev) => {
        const next = new Set(prev);
        next.delete(friendId);
        return next;
      });
    }
  };

  // Sort: hosting > playing > online > offline
  const sorted = [...friends].sort((a, b) => {
    const order = { hosting: 0, playing: 1, online: 2, offline: 3 };
    return (order[a.presence.status] ?? 3) - (order[b.presence.status] ?? 3);
  });

  if (loading) {
    return <div className="text-center text-muted-foreground py-8">加载好友列表…</div>;
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">
          好友动态
          {friends.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({friends.length})
            </span>
          )}
        </h2>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {sorted.length === 0 ? (
        <p className="text-center text-muted-foreground py-6">
          暂无好友，在下方搜索添加
        </p>
      ) : (
        <div className="space-y-1">
          {sorted.map((friend) => {
            const cfg = STATUS_CONFIG[friend.presence.status] || STATUS_CONFIG.offline;
            const canInvite = isHosting && (friend.presence.status === 'online' || friend.presence.status === 'playing');

            return (
              <div
                key={friend.id}
                className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Avatar placeholder */}
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                    {(friend.display_name || friend.username || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {friend.display_name || friend.username}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{cfg.icon}</span>
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      {friend.presence.status === 'hosting' && friend.presence.room_name && (
                        <span className="truncate ml-1">{friend.presence.room_name}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {/* 好友正在开房 → 显示加入 */}
                  {friend.presence.status === 'hosting' && friend.presence.room_code && (
                    <button
                      onClick={() => copyRoomCode(friend.presence.room_code!)}
                      className="rounded bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20 transition-colors"
                    >
                      {copiedCode === friend.presence.room_code ? '已复制 ✓' : '加入房间'}
                    </button>
                  )}
                  {/* 当前用户在开房 + 好友在线 → 邀请 */}
                  {canInvite && (
                    <button
                      onClick={() => inviteFriend(friend.id)}
                      disabled={inviting.has(friend.id)}
                      className="rounded bg-green-500/10 px-2 py-1 text-xs text-green-700 dark:text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                    >
                      {inviting.has(friend.id) ? '邀请中…' : '邀请联机'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

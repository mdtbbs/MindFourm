'use client';

import { useState, useEffect, useCallback } from 'react';
import { friendsApi } from '@/lib/api/client';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import Link from 'next/link';

interface Friend {
  id: number;
  username: string;
  avatar_url: string;
  friendship_since: string;
}

export default function FriendsList() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<Set<number>>(new Set());

  const fetchFriends = useCallback(async () => {
    try {
      const res = await friendsApi.getList(1, 100);
      setFriends(res.friends || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const removeFriend = async (userId: number) => {
    if (!confirm('确定要删除这位好友吗？')) return;
    setRemoving((prev) => new Set(prev).add(userId));
    try {
      await friendsApi.removeFriend(userId);
      setFriends((prev) => prev.filter((f) => f.id !== userId));
    } catch {
      // silent
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="card p-6">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted" />
              <div className="flex-1">
                <div className="h-4 bg-muted rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="text-4xl mb-3">👥</div>
        <p className="text-muted-foreground">还没有好友</p>
        <p className="text-sm text-muted-foreground mt-1">
          在下方搜索添加好友吧
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h2 className="text-lg font-bold mb-3">
        好友列表
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          ({friends.length})
        </span>
      </h2>
      <div className="space-y-1">
        {friends.map((friend) => (
          <div
            key={friend.id}
            className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
          >
            <Link
              href={`/users/${friend.id}`}
              className="flex items-center gap-3 flex-1 min-w-0"
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                  {friend.username[0].toUpperCase()}
                </div>
                <OnlineIndicator
                  userId={friend.id}
                  size="sm"
                  className="absolute -bottom-0.5 -right-0.5"
                />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{friend.username}</div>
                <div className="text-xs text-muted-foreground">
                  成为好友 {new Date(friend.friendship_since).toLocaleDateString()}
                </div>
              </div>
            </Link>
            <div className="flex items-center gap-2 ml-2">
              <Link
                href={`/messages/${friend.id}`}
                className="rounded bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                发消息
              </Link>
              <button
                onClick={() => removeFriend(friend.id)}
                disabled={removing.has(friend.id)}
                className="rounded bg-red-500/10 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {removing.has(friend.id) ? '删除中…' : '删除'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

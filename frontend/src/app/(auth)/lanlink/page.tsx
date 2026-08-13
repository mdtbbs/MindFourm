'use client';

import { useState, useEffect } from 'react';
import { isLanLinkLoggedIn, getLanLinkUser, logoutLanLink, type LanLinkUser } from '@/lib/api/lanlinkClient';
import LanLinkAuth from '@/components/lanlink/LanLinkAuth';
import RoomList from '@/components/lanlink/RoomList';
import FriendsPanel from '@/components/lanlink/FriendsPanel';
import FriendSearch from '@/components/lanlink/FriendSearch';
import FriendRequests from '@/components/lanlink/FriendRequests';
import Link from 'next/link';

export default function LanLinkPage() {
  const [user, setUser] = useState<LanLinkUser | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (isLanLinkLoggedIn()) {
      setUser(getLanLinkUser());
    }
    setMounted(true);
  }, []);

  const handleLogin = (loggedInUser: LanLinkUser) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    logoutLanLink();
    setUser(null);
  };

  if (!mounted) {
    return (
      <div className="text-center text-muted-foreground py-12">加载中…</div>
    );
  }

  if (!user) {
    return (
      <>
        <div>
          <h1 className="text-3xl font-bold mb-2">🎮 LanLink 联机大厅</h1>
          <p className="text-muted-foreground">
            查看公开房间、好友状态，管理你的好友列表。
          </p>
        </div>
        <LanLinkAuth onLogin={handleLogin} />
      </>
    );
  }

  return (
    <>
      {/* Header with user info */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">🎮 LanLink 联机大厅</h1>
          <p className="text-muted-foreground text-sm">
            查看公开房间、好友状态，管理你的好友列表。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium">
              {user.display_name || user.username}
            </div>
            <div className="text-xs text-muted-foreground">{user.role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            退出
          </button>
        </div>
      </div>

      {/* Room list */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/lanlink/quick-code" className="card p-4 transition-colors hover:border-primary/50">
          <p className="text-sm font-semibold">游戏快速码</p>
          <p className="mt-1 text-xs text-muted-foreground">在论坛管理一次性快速码，供 LanLink Mod 安全登录。</p>
        </Link>
        <Link href="/resources?category_id=1" className="card p-4 transition-colors hover:border-primary/50">
          <p className="text-sm font-semibold">联机资源</p>
          <p className="mt-1 text-xs text-muted-foreground">浏览服务器、地图、蓝图与联机相关资源。</p>
        </Link>
        <Link href="/posts/new" className="card p-4 transition-colors hover:border-primary/50">
          <p className="text-sm font-semibold">发布联机帖</p>
          <p className="mt-1 text-xs text-muted-foreground">分享房间、招募队友或发布联机说明。</p>
        </Link>
      </div>
      <RoomList />

      {/* Friend requests (only shown when there are pending) */}
      <FriendRequests />

      {/* Friends panel */}
      <FriendsPanel />

      {/* Friend search */}
      <FriendSearch />
    </>
  );
}

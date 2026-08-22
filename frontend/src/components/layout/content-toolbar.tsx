'use client';

import Link from 'next/link';
import { BookOpen, Boxes, ChevronDown, Compass } from 'lucide-react';
import { UnifiedHeader } from '@/lib/shared';
import type { User } from '@/types';
import NotificationDropdown from '@/components/forum/notification-dropdown';

export default function ContentToolbar({
  siteName,
  logoUrl,
  user,
  isAuthenticated,
  unreadMessageCount,
  unreadFriendRequestCount,
  onLogin,
  onRegister,
  onLogout,
  onSearch,
  onOpenDrawer,
}: {
  siteName: string;
  logoUrl?: string;
  user: User | null;
  isAuthenticated: boolean;
  unreadMessageCount: number;
  unreadFriendRequestCount: number;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
  onSearch: (query: string) => void;
  onOpenDrawer: () => void;
}) {
  return (
    <UnifiedHeader
      showSearch
      showPostButton
      showMessages
      showNotifications
      showFriends
      showMobileMenu
      siteName={siteName}
      logoUrl={logoUrl}
      user={user}
      isAuthenticated={isAuthenticated}
      unreadMessageCount={unreadMessageCount}
      unreadFriendRequestCount={unreadFriendRequestCount}
      onLogin={onLogin}
      onRegister={onRegister}
      onLogout={onLogout}
      onSearch={onSearch}
      onMobileMenuClick={onOpenDrawer}
      notificationDropdownSlot={<NotificationDropdown />}
      topNavigationSlot={(
        <nav aria-label="主导航" className="flex min-w-0 items-center gap-1 sm:gap-3">
          <Link href="/" className="mr-2 flex shrink-0 items-center gap-2 font-semibold text-[var(--text)] hover:text-[var(--primary)]">
            {logoUrl ? <img src={logoUrl} alt="" className="h-7 w-7 rounded object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded bg-[var(--primary)] text-xs font-bold text-white">M</span>}
            <span className="hidden lg:inline">{siteName}</span>
          </Link>
          <details className="group relative hidden md:block">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)]"><BookOpen className="h-4 w-4" />论坛<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
            <div className="absolute left-0 top-full z-20 mt-2 min-w-36 border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-lg">
              <Link href="/" className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]">最新讨论</Link>
              <Link href="/categories" className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]">论坛板块</Link>
              <Link href="/tags" className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]">标签</Link>
            </div>
          </details>
          <details className="group relative hidden md:block">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)]"><Boxes className="h-4 w-4" />资源<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
            <div className="absolute left-0 top-full z-20 mt-2 min-w-36 border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-lg">
              <Link href="/resources" className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]">资源中心</Link>
              <Link href="/resources?kind=mod" className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]">Mod</Link>
              <Link href="/resources?kind=map" className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]">地图</Link>
            </div>
          </details>
          <details className="group relative hidden lg:block">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)]"><Compass className="h-4 w-4" />发现<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary>
            <div className="absolute left-0 top-full z-20 mt-2 min-w-36 border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-lg">
              <Link href="/discover" className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]">发现首页</Link>
              <Link href="/game-servers" className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]">联机</Link>
              <Link href="/notices" className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]">公告</Link>
            </div>
          </details>
        </nav>
      )}
    />
  );
}

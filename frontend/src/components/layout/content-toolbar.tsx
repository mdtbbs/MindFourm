'use client';

import Link from 'next/link';
import { BookOpen, Boxes, Hash, Search } from 'lucide-react';
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
          <Link href="/" className="hidden items-center gap-1.5 px-2 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] md:inline-flex"><BookOpen className="h-4 w-4" />论坛</Link>
          <Link href="/resources" className="hidden items-center gap-1.5 px-2 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] md:inline-flex"><Boxes className="h-4 w-4" />资源</Link>
          <Link href="/tags" className="hidden items-center gap-1.5 px-2 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] lg:inline-flex"><Hash className="h-4 w-4" />标签</Link>
          <Link href="/search" className="hidden items-center gap-1.5 px-2 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] xl:inline-flex"><Search className="h-4 w-4" />搜索</Link>
        </nav>
      )}
    />
  );
}

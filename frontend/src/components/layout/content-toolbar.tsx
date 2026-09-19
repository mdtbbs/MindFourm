"use client";

import Link from "next/link";
import { UnifiedHeader } from "@/lib/shared";
import type { User } from "@/types";
import NotificationDropdown from "@/components/forum/notification-dropdown";

function UserMobileIdentity({
  siteName,
  logoUrl,
}: {
  siteName: string;
  logoUrl?: string;
}) {
  return (
    <div className="flex min-w-0 items-center">
      <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold text-[var(--text)] lg:hidden">
        {logoUrl ? <img src={logoUrl} alt="" className="h-7 w-7 rounded object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded bg-[var(--primary)] text-xs font-bold text-white">M</span>}
        <span className="max-w-28 truncate text-sm">{siteName}</span>
      </Link>
    </div>
  );
}

export default function ContentToolbar(props: {
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
  navigationMode?: 'forum' | 'resources';
}) {
  return (
    <UnifiedHeader
      showSearch
      showPostButton
      showNotifications
      showMobileMenu
      siteName={props.siteName}
      logoUrl={props.logoUrl}
      user={props.user}
      isAuthenticated={props.isAuthenticated}
      unreadMessageCount={props.unreadMessageCount}
      unreadFriendRequestCount={props.unreadFriendRequestCount}
      onLogin={props.onLogin}
      onRegister={props.onRegister}
      onLogout={props.onLogout}
      onSearch={props.onSearch}
      onMobileMenuClick={props.onOpenDrawer}
      notificationDropdownSlot={<NotificationDropdown />}
      topNavigationSlot={
        props.navigationMode ? (
          <UserMobileIdentity siteName={props.siteName} logoUrl={props.logoUrl} />
        ) : undefined
      }
    />
  );
}

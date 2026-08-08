'use client';

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
    />
  );
}

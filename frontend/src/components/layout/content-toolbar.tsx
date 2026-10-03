"use client";

import Link from "next/link";
import { UnifiedHeader } from "@/lib/shared";
import type { User } from "@/types";
import NotificationDropdown from "@/components/forum/notification-dropdown";
import { LocaleSwitcher, useI18n } from '@/i18n/provider';

function UserMobileIdentity({
  siteName,
  logoUrl,
}: {
  siteName: string;
  logoUrl?: string;
}) {
  const { t } = useI18n();
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
  const { t } = useI18n();
  return (
    <UnifiedHeader
      showSearch
      showPostButton
      showNotifications
      showMobileMenu
      siteName={props.siteName}
      logoUrl={props.logoUrl}
      labels={{
        searchCommunity: t('common.searchCommunity'), search: t('common.search'),
        switchToLight: t('common.switchToLight'), switchToDark: t('common.switchToDark'),
        theme: t('common.theme'), menu: t('common.menu'), notifications: t('navigation.notifications'),
        messages: t('navigation.messages'), friends: t('navigation.friends'), servers: t('navigation.servers'),
        createPost: t('forum.createPost'), profile: t('navigation.profile'), bookmarks: t('navigation.bookmarks'),
        admin: t('navigation.admin'), settings: t('navigation.settings'), logout: t('navigation.logout'),
        register: t('navigation.register'), login: t('navigation.login'),
      }}
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
      userMenuSlot={<div className="border-t border-[var(--border)]"><LocaleSwitcher className="w-full" /></div>}
      utilitySlot={<LocaleSwitcher className="hidden lg:block" />}
      topNavigationSlot={
        props.navigationMode ? (
          <UserMobileIdentity siteName={props.siteName} logoUrl={props.logoUrl} />
        ) : undefined
      }
    />
  );
}

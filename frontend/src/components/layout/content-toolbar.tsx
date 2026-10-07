"use client";

import Link from "next/link";
import { usePathname } from 'next/navigation';
import { UnifiedHeader } from "@/lib/shared";
import type { User } from "@/types";
import NotificationDropdown from "@/components/forum/notification-dropdown";
import CreateMenu from '@/components/layout/create-menu';
import { LocaleSwitcher, useI18n } from '@/i18n/provider';
import { resolveWorkspaceBreadcrumb } from '@/lib/navigation/workspace-navigation';

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

function WorkspaceBreadcrumb({ userId }: { userId?: number }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const items = resolveWorkspaceBreadcrumb(pathname, userId);
  return <nav aria-label={t('navigation.breadcrumb')} className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
    {items.map((item, index) => <span key={`${item.labelKey}-${index}`} className="flex min-w-0 items-center gap-2">
      {index > 0 && <span aria-hidden="true" className="text-[var(--text-muted)]">/</span>}
      {item.href ? <Link href={item.href} className="truncate text-[var(--text-muted)] hover:text-[var(--text)]">{t(item.labelKey)}</Link> : <span aria-current="page" className="truncate font-medium text-[var(--text)]">{t(item.labelKey)}</span>}
    </span>)}
  </nav>;
}

export default function ContentToolbar(props: {
  siteName: string;
  logoUrl?: string;
  user: User | null;
  isAuthenticated: boolean;
  onLogin: () => void;
  onRegister: () => void;
  onLogout: () => void;
  onOpenSearch: () => void;
}) {
  const { t } = useI18n();
  return (
    <UnifiedHeader
      showSearch
      showNotifications
      onOpenSearch={props.onOpenSearch}
      siteName={props.siteName}
      logoUrl={props.logoUrl}
      labels={{
        searchCommunity: t('common.searchCommunity'), search: t('common.search'),
        switchToLight: t('common.switchToLight'), switchToDark: t('common.switchToDark'),
        theme: t('common.theme'), menu: t('common.menu'), notifications: t('navigation.notifications'),
        messages: t('navigation.messages'), friends: t('navigation.friends'), servers: t('navigation.servers'),
        createPost: t('forum.createPost'), profile: t('navigation.profile'), bookmarks: t('navigation.bookmarks'),
        myContent: t('navigation.myContent'), developerCenter: t('navigation.developerCenter'),
        admin: t('navigation.admin'), settings: t('navigation.settings'), logout: t('navigation.logout'),
        register: t('navigation.register'), login: t('navigation.login'),
        searchShortcut: t('searchCommand.shortcut'), create: t('create.title'),
      }}
      user={props.user}
      isAuthenticated={props.isAuthenticated}
      onLogin={props.onLogin}
      onRegister={props.onRegister}
      onLogout={props.onLogout}
      onSearch={() => props.onOpenSearch()}
      notificationDropdownSlot={props.isAuthenticated ? <NotificationDropdown /> : undefined}
      createMenuSlot={<CreateMenu isAuthenticated={props.isAuthenticated} />}
      userMenuSlot={<div className="border-t border-[var(--border)]"><LocaleSwitcher className="w-full" /></div>}
      topNavigationSlot={<><UserMobileIdentity siteName={props.siteName} logoUrl={props.logoUrl} /><WorkspaceBreadcrumb userId={props.user?.id} /></>}
    />
  );
}

'use client';

import Link from 'next/link';
import SidebarNavGroups from '@/components/layout/sidebar-nav-groups';
import SidebarUserPanel from '@/components/layout/sidebar-user-panel';
import type { SiteNavigationModel } from '@/lib/navigation/site-navigation';

export default function ContentSidebar({
  navigation,
  siteName,
  logoUrl,
  userName,
  userMeta,
  onLogin,
  onRegister,
}: {
  navigation: SiteNavigationModel;
  currentPathname: string;
  siteName: string;
  logoUrl?: string;
  userName?: string;
  userMeta?: string;
  onLogin: () => void;
  onRegister: () => void;
}) {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-[var(--border)] bg-[var(--bg-card)] lg:flex lg:min-h-screen lg:flex-col lg:sticky lg:top-0">
      <div className="border-b border-[var(--border)] p-4">
        <Link href="/" className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={siteName} className="h-8 max-w-[140px] object-contain" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-sm font-bold text-white">
              {siteName.slice(0, 1) || 'M'}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--text)]">{siteName}</div>
            <div className="text-xs text-[var(--text-muted)]">内容导航中心</div>
          </div>
        </Link>
      </div>

      <SidebarNavGroups
        primaryItems={navigation.primaryItems}
        groups={navigation.groups}
        personalItems={navigation.personalItems}
        quickActions={navigation.quickActions}
        onLogin={onLogin}
        onRegister={onRegister}
      />

      <SidebarUserPanel
        userName={userName}
        userMeta={userMeta}
      />
    </aside>
  );
}

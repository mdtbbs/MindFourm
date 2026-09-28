"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSse } from "@/hooks/use-sse";
import { useAuth } from "@/lib/auth/context";
import { useSettings } from "@/lib/settings/context";
import { resolveBrand } from "@/lib/theme/brand";
import {
  messageApi,
  friendsApi,
} from "@/lib/api/client";
import type { Notification } from "@/types";
import Footer from "@/components/forum/footer";
import AnnouncementBanner from "@/components/forum/announcement-banner";
import PrivacyNotice from "@/components/legal/privacy-notice";
import ContentSidebar from "@/components/layout/content-sidebar";
import ContentDrawer from "@/components/layout/content-drawer";
import ContentToolbar from "@/components/layout/content-toolbar";
import { useNavigation } from '@/lib/navigation/context';
import MobileBottomNavigation from '@/components/layout/mobile-bottom-navigation';
import { useI18n } from '@/i18n/provider';

export default function ContentShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, logout } = useAuth();
  const { locale, t } = useI18n();
  const settings = useSettings();
  const navigation = useNavigation();
  const brand = resolveBrand(settings);
  const router = useRouter();
  const pathname = usePathname();
  const isResources = pathname.startsWith('/resources');
  // Global navigation remains stable; only the context section follows the route.
  const sidebarMode = isResources ? 'resources' : 'forum';
  const mindauthUrl =
    process.env.NEXT_PUBLIC_MINDAUTH_URL || "http://localhost:4001";

  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [unreadFriendRequestCount, setUnreadFriendRequestCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadMsgCount(0);
      setUnreadFriendRequestCount(0);
      return;
    }

    let cancelled = false;
    messageApi
      .unreadCount()
      .then((res) => {
        if (!cancelled) setUnreadMsgCount(res.count);
      })
      .catch(() => {});

    friendsApi
      .getRequests(1, 1)
      .then((res) => {
        if (!cancelled) setUnreadFriendRequestCount(res.total || 0);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const handleMessageEvent = useCallback((notification: Notification) => {
    if (notification.type === "message") {
      messageApi
        .unreadCount()
        .then((res) => setUnreadMsgCount(res.count))
        .catch(() => {});
    }

    if (notification.type === "friend_request") {
      friendsApi
        .getRequests(1, 1)
        .then((res) => setUnreadFriendRequestCount(res.total || 0))
        .catch(() => {});
    }
  }, []);

  useSse("notification", handleMessageEvent, { enabled: isAuthenticated });

  const buildAuthUrl = (endpoint: "login" | "register") => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectUrl = encodeURIComponent(`${siteUrl}/api/auth/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || "forum";
    const redirectPath =
      `${window.location.pathname}${window.location.search}` || "/";
    return `${mindauthUrl}/${endpoint}?redirect=${redirectUrl}&client_id=${clientId}&state=${encodeURIComponent(redirectPath)}&ui_locales=${encodeURIComponent(locale)}`;
  };

  const handleSearch = (query: string) => {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const userMeta = isAuthenticated ? t('auth.signedIn') : t('auth.guest');
  // Admin lives in its own route layout. Every SiteShell page keeps this
  // sidebar, with resource pages merely changing which section is emphasised.
  const showDesktopSidebar = true;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] lg:flex lg:min-h-0">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-16 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--primary)]"
      >
        {t('common.skipToContent')}
      </a>
      {showDesktopSidebar && (
        <Suspense fallback={null}>
          <ContentSidebar
            mode={sidebarMode}
            siteName={brand.siteName}
            sidebarTitle={brand.sidebarTitle}
            logoUrl={brand.logoUrl || undefined}
            sidebarLogoUrl={brand.sidebarLogoUrl || undefined}
            userName={user?.username || undefined}
            userId={user?.id}
            isAuthenticated={isAuthenticated}
            userMeta={userMeta}
            settings={settings}
            resourceCategories={navigation.resourceCategories}
            forumCategories={navigation.forumCategories}
          />
        </Suspense>
      )}

      {mobileMenuOpen && (
        <Suspense fallback={null}>
          <ContentDrawer
            open
            mode={sidebarMode}
            onClose={() => setMobileMenuOpen(false)}
            siteName={brand.siteName}
            sidebarTitle={brand.sidebarTitle}
            logoUrl={brand.logoUrl || undefined}
            sidebarLogoUrl={brand.sidebarLogoUrl || undefined}
            userName={user?.username || undefined}
            userId={user?.id}
            isAuthenticated={isAuthenticated}
            userMeta={userMeta}
            settings={settings}
            resourceCategories={navigation.resourceCategories}
            forumCategories={navigation.forumCategories}
          />
        </Suspense>
      )}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        <ContentToolbar
          siteName={brand.siteName}
          logoUrl={brand.logoUrl || undefined}
          user={user}
          isAuthenticated={isAuthenticated}
          unreadMessageCount={unreadMsgCount}
          unreadFriendRequestCount={unreadFriendRequestCount}
          onLogin={() => {
            window.location.href = buildAuthUrl("login");
          }}
          onRegister={() => {
            window.location.href = buildAuthUrl("register");
          }}
          onLogout={logout}
          onSearch={handleSearch}
          onOpenDrawer={() => setMobileMenuOpen(true)}
          navigationMode={sidebarMode}
        />
        <AnnouncementBanner />
        <PrivacyNotice />
        <main id="main-content" data-theme-surface tabIndex={-1} className="min-w-0 flex-1">{children}</main>
        <Footer />
      </div>
      <MobileBottomNavigation isAuthenticated={isAuthenticated} userId={user?.id} />
    </div>
  );
}

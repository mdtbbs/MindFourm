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
  resourceApi,
  categoryApi,
} from "@/lib/api/client";
import type { Notification, ResourceCategory, Category } from "@/types";
import Footer from "@/components/forum/footer";
import AnnouncementBanner from "@/components/forum/announcement-banner";
import PrivacyNotice from "@/components/legal/privacy-notice";
import ContentSidebar from "@/components/layout/content-sidebar";
import ContentDrawer from "@/components/layout/content-drawer";
import ContentToolbar from "@/components/layout/content-toolbar";
import { roleLabel } from "@/lib/display-labels";

export default function ContentShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, logout } = useAuth();
  const settings = useSettings();
  const brand = resolveBrand(settings);
  const router = useRouter();
  const pathname = usePathname();
  const isResources = pathname.startsWith('/resources');
  // ContentShell is mounted only from UserSiteShell: every route here is a
  // user-facing product page and therefore shares the persistent sidebar.
  const sidebarMode = isResources ? 'resources' : 'forum';
  const mindauthUrl =
    process.env.NEXT_PUBLIC_MINDAUTH_URL || "http://localhost:4001";

  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [unreadFriendRequestCount, setUnreadFriendRequestCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [resourceCategories, setResourceCategories] = useState<
    ResourceCategory[]
  >([]);
  const [forumCategories, setForumCategories] = useState<Category[]>([]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    resourceApi
      .getCategories()
      .then((res) => {
        if (!cancelled) setResourceCategories(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    categoryApi
      .getList()
      .then((res) => {
        if (!cancelled) setForumCategories(Array.isArray(res) ? res : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
    return `${mindauthUrl}/${endpoint}?redirect=${redirectUrl}&client_id=${clientId}&state=${encodeURIComponent(redirectPath)}`;
  };

  const handleSearch = (query: string) => {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const userMeta = user?.role
    ? `角色：${roleLabel(user.role)}`
    : isAuthenticated
      ? "已登录"
      : "未登录";
  // Admin lives in its own route layout. Every UserSiteShell page keeps this
  // sidebar, with resource pages merely changing which section is emphasised.
  const showDesktopSidebar = true;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] lg:flex lg:min-h-0">
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
            resourceCategories={resourceCategories}
            forumCategories={forumCategories}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <ContentDrawer
          open={mobileMenuOpen}
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
          resourceCategories={resourceCategories}
          forumCategories={forumCategories}
        />
      </Suspense>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
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
          showPublicNavigation={false}
        />
        <AnnouncementBanner />
        <PrivacyNotice />
        <main className="min-w-0 flex-1">{children}</main>
        <Footer />
      </div>
    </div>
  );
}

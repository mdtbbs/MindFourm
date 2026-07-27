'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSse } from '@/hooks/use-sse';
import { UnifiedHeader } from '@/lib/shared';
import { useAuth } from '@/lib/auth/context';
import { useSettings } from '@/lib/settings/context';
import { messageApi } from '@/lib/api/client';
import NotificationDropdown from '@/components/forum/notification-dropdown';
import Footer from '@/components/forum/footer';
import AnnouncementBanner from '@/components/forum/announcement-banner';
import MobileNavMenu from '@/components/layout/mobile-nav-menu';

interface SiteShellProps {
  children: React.ReactNode;
}

/**
 * Header, announcement banner, mobile navigation and footer.
 *
 * Shared by the `(public)` and `(auth)` route groups. `(auth)` previously had no
 * layout at all, so `/notifications`, `/bookmarks`, `/users/me/edit` and the
 * server-application pages rendered with no header, navigation or footer — the only
 * way out was the browser's Back button. One page worked around it by rendering its
 * own header; extracting the shell here keeps the two groups from drifting apart.
 */
export default function SiteShell({ children }: SiteShellProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const settings = useSettings();
  const router = useRouter();
  const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';

  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetched once per session rather than polled every 60s: an SSE channel is already
  // open for this user, so the interval was duplicate work on every page for every
  // signed-in visitor. Live updates arrive through `message` events below.
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadMsgCount(0);
      return;
    }

    let cancelled = false;
    messageApi.unreadCount()
      .then((res) => { if (!cancelled) setUnreadMsgCount(res.count); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  const handleMessageEvent = useCallback(() => {
    setUnreadMsgCount((count) => count + 1);
  }, []);

  useSse('message', handleMessageEvent, { enabled: isAuthenticated });

  /** MindAuth expects the backend callback, and `state` carries where to return to. */
  const buildAuthUrl = (endpoint: 'login' | 'register') => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectUrl = encodeURIComponent(`${siteUrl}/api/auth/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || 'forum';
    const redirectPath = `${window.location.pathname}${window.location.search}` || '/';
    return `${mindauthUrl}/${endpoint}?redirect=${redirectUrl}&client_id=${clientId}&state=${encodeURIComponent(redirectPath)}`;
  };

  const handleSearch = (query: string) => {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <UnifiedHeader
        showSearch
        showPostButton
        showMessages
        showNotifications
        siteName={settings.site_name || 'MindBBS'}
        logoUrl={settings.site_logo_url}
        user={user}
        isAuthenticated={isAuthenticated}
        unreadMessageCount={unreadMsgCount}
        onLogin={() => { window.location.href = buildAuthUrl('login'); }}
        onRegister={() => { window.location.href = buildAuthUrl('register'); }}
        onLogout={logout}
        onSearch={handleSearch}
        notificationDropdownSlot={<NotificationDropdown />}
        // Without these the hamburger never renders, and since the home sidebar is
        // `lg:block` only, mobile visitors had no route to categories or tags at all.
        showMobileMenu
        onMobileMenuClick={() => setMobileMenuOpen((open) => !open)}
        mobileMenuSlot={
          mobileMenuOpen ? <MobileNavMenu onNavigate={() => setMobileMenuOpen(false)} /> : null
        }
      />
      <AnnouncementBanner />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

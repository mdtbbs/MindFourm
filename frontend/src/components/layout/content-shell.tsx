"use client";

import { Suspense, useCallback, useState } from "react";
import { useForumRealtime } from '@/hooks/use-forum-realtime';
import { useAuth } from "@/lib/auth/context";
import { useSettings } from "@/lib/settings/context";
import { resolveBrand } from "@/lib/theme/brand";
import Footer from "@/components/forum/footer";
import AnnouncementBanner from "@/components/forum/announcement-banner";
import PrivacyNotice from "@/components/legal/privacy-notice";
import ContentSidebar from "@/components/layout/content-sidebar";
import ContentToolbar from "@/components/layout/content-toolbar";
import MobileBottomNavigation from '@/components/layout/mobile-bottom-navigation';
import GlobalSearchCommand from '@/components/layout/global-search-command';
import { useI18n } from '@/i18n/provider';

export default function ContentShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, logout } = useAuth();
  const { locale, t } = useI18n();
  const settings = useSettings();
  const brand = resolveBrand(settings);
  const mindauthUrl =
    process.env.NEXT_PUBLIC_MINDAUTH_URL || "http://localhost:4001";
  useForumRealtime(user?.id, isAuthenticated);

  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    window.requestAnimationFrame(() => {
      const trigger = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="global-search-trigger-"]'))
        .find((element) => element.getClientRects().length > 0);
      trigger?.focus();
    });
  }, []);

  const buildAuthUrl = (endpoint: "login" | "register") => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectUrl = encodeURIComponent(`${siteUrl}/api/auth/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || "forum";
    const redirectPath =
      `${window.location.pathname}${window.location.search}` || "/";
    return `${mindauthUrl}/${endpoint}?redirect=${redirectUrl}&client_id=${clientId}&state=${encodeURIComponent(redirectPath)}&ui_locales=${encodeURIComponent(locale)}`;
  };

  const userMeta = isAuthenticated ? t('auth.signedIn') : t('auth.guest');

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] lg:flex lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-16 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--primary)]"
      >
        {t('common.skipToContent')}
      </a>
      <Suspense fallback={null}>
        <ContentSidebar
          siteName={brand.siteName}
          logoUrl={brand.logoUrl || undefined}
          sidebarLogoUrl={brand.sidebarLogoUrl || undefined}
          userName={user?.username || undefined}
          userId={user?.id}
          isAuthenticated={isAuthenticated}
          userMeta={userMeta}
          settings={settings}
        />
      </Suspense>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pb-0">
        <ContentToolbar
          siteName={brand.siteName}
          logoUrl={brand.logoUrl || undefined}
          user={user}
          isAuthenticated={isAuthenticated}
          onLogin={() => {
            window.location.href = buildAuthUrl("login");
          }}
          onRegister={() => {
            window.location.href = buildAuthUrl("register");
          }}
          onLogout={logout}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <AnnouncementBanner />
        <PrivacyNotice />
        <main id="main-content" data-theme-surface tabIndex={-1} className="min-w-0 flex-1">{children}</main>
        <Footer />
      </div>
      <MobileBottomNavigation userId={user?.id} />
      <GlobalSearchCommand open={searchOpen} onClose={closeSearch} onOpenChange={setSearchOpen} />
    </div>
  );
}

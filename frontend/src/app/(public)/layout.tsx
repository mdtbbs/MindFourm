'use client';

import { useAuth } from '@/lib/auth/context';
import { useSettings } from '@/lib/settings/context';
import { UnifiedHeader } from '@mindproject/shared';
import { messageApi } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import NotificationDropdown from '@/components/forum/notification-dropdown';
import Footer from '@/components/forum/footer';
import AnnouncementBanner from '@/components/forum/announcement-banner';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated, logout } = useAuth();
  const settings = useSettings();
  const router = useRouter();
  const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    messageApi.unreadCount()
      .then((res) => setUnreadMsgCount(res.count))
      .catch(() => {});
    const interval = setInterval(() => {
      messageApi.unreadCount()
        .then((res) => setUnreadMsgCount(res.count))
        .catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleLogin = () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectUrl = encodeURIComponent(`${siteUrl}/api/auth/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || 'forum';
    const redirectPath = `${window.location.pathname}${window.location.search}`;
    window.location.href = `${mindauthUrl}/login?redirect=${redirectUrl}&client_id=${clientId}&state=${encodeURIComponent(redirectPath || '/')}`;
  };

  const handleRegister = () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectUrl = encodeURIComponent(`${siteUrl}/api/auth/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || 'forum';
    const redirectPath = `${window.location.pathname}${window.location.search}`;
    window.location.href = `${mindauthUrl}/register?redirect=${redirectUrl}&client_id=${clientId}&state=${encodeURIComponent(redirectPath || '/')}`;
  };

  const handleSearch = (query: string) => {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleLogout = () => {
    logout();
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
        onLogin={handleLogin}
        onRegister={handleRegister}
        onLogout={handleLogout}
        onSearch={handleSearch}
        notificationDropdownSlot={<NotificationDropdown />}
      />
      <AnnouncementBanner />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

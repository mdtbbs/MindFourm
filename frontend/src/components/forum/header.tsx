'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { useSettings } from '@/lib/settings/context';
import { messageApi } from '@/lib/api/client';
import { Search, Mail } from 'lucide-react';
import { UnifiedHeader } from '@mindproject/shared/components';
import { ThemeProvider } from '@mindproject/shared/hooks';
import NotificationDropdown from './notification-dropdown';

// 内部组件：处理本地逻辑
function HeaderInner() {
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
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const redirectUrl = encodeURIComponent(`${apiBase}/api/auth/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || '';
    const currentPath = typeof window !== 'undefined'
      ? encodeURIComponent(window.location.pathname + window.location.search)
      : '';
    window.location.href = `${mindauthUrl}/login?redirect=${redirectUrl}&client_id=${clientId}&state=${currentPath}`;
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const handleSearch = (query: string) => {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const navItems = [
    { label: '首页', href: '/', active: false },
    { label: '服务器', href: '/servers', active: false },
    { label: '资源', href: '/resources', active: false },
  ];

  // 自定义右侧内容：搜索 + 通知 + 私信
  const rightContent = (
    <>
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="搜索..."
          aria-label="搜索"
          className="w-full pl-9 pr-3 py-1 bg-[var(--bg-elevated)] text-[var(--text)] rounded-[var(--radius)] text-sm placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--primary)]"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch((e.target as HTMLInputElement).value); }}
        />
      </div>
      {/* Notifications & Messages */}
      {isAuthenticated && user && (
        <>
          <NotificationDropdown />
          <Link
            href="/messages"
            className="relative p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
          >
            <Mail className="w-5 h-5" />
            {unreadMsgCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                {unreadMsgCount > 9 ? '9+' : unreadMsgCount}
              </span>
            )}
          </Link>
        </>
      )}
    </>
  );

  return (
    <UnifiedHeader
      appName="MindBBS"
      navItems={navItems}
      showServerApply={isAuthenticated}
      showManagerLink={true}
      managerUrl={process.env.NEXT_PUBLIC_EASYMANAGER_URL || 'http://localhost:3001'}
      user={user}
      isAuthenticated={isAuthenticated}
      onLogin={handleLogin}
      onLogout={handleLogout}
      rightContent={rightContent}
    />
  );
}

// 导出包装组件
export default function Header() {
  return (
    <ThemeProvider>
      <HeaderInner />
    </ThemeProvider>
  );
}
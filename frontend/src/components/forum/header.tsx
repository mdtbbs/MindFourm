'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { useSettings } from '@/lib/settings/context';
import { useTheme } from '@/components/forum/theme-toggle';
import { messageApi } from '@/lib/api/client';
import { Search, User, LogOut, Shield, Moon, Sun, Mail, Bell } from 'lucide-react';
import NotificationDropdown from './notification-dropdown';

export default function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const settings = useSettings();
  const { theme, toggle: toggleTheme } = useTheme();
  const router = useRouter();
  const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';
  const siteName = settings.site_name || 'MindForum';
  const logoUrl = settings.site_logo_url || '';
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  // Fetch unread message count
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

  const handleRegister = () => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const redirectUrl = encodeURIComponent(`${apiBase}/api/auth/callback`);
    const clientId = process.env.NEXT_PUBLIC_MINDAUTH_CLIENT_ID || '';
    const currentPath = typeof window !== 'undefined'
      ? encodeURIComponent(window.location.pathname + window.location.search)
      : '';
    window.location.href = `${mindauthUrl}/register?redirect=${redirectUrl}&client_id=${clientId}&state=${currentPath}`;
  };

  const handleSearch = (query: string) => {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <header className="bg-[var(--bg)] border-b border-[var(--border)] sticky top-0 z-50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt={siteName} className="h-8 object-contain" />
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xl font-bold text-[var(--primary)]">{siteName || 'MindBBS'}</span>
                <span className="text-xs text-[var(--text-muted)]">(mdtbbs)</span>
              </div>
            )}
          </Link>

          {/* Search */}
          <div className="flex-1 max-w-lg mx-2 sm:mx-4 md:mx-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="搜索帖子..."
                aria-label="搜索帖子"
                className="w-full pl-10 pr-4 py-1.5 sm:py-2 bg-[var(--bg-elevated)] text-[var(--text)] rounded-[var(--radius)] border-0 focus:ring-2 focus:ring-[var(--primary)] text-sm placeholder:text-[var(--text-muted)]"
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch((e.target as HTMLInputElement).value); }}
              />
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={toggleTheme}
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              aria-label="切换主题"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            {isAuthenticated && user ? (
              <>
                <NotificationDropdown />
                <Link
                  href="/messages"
                  className="relative p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                  title="私信"
                >
                  <Mail className="w-5 h-5" />
                  {unreadMsgCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                      {unreadMsgCount > 9 ? '9+' : unreadMsgCount}
                    </span>
                  )}
                </Link>
                <Link
                  href="/posts/new"
                  className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
                >
                  发帖
                </Link>
                {user.role === 'admin' && (
                  <Link
                    href="/admin"
                    className="p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                    title="管理后台"
                  >
                    <Shield className="w-5 h-5" />
                  </Link>
                )}
                <Link
                  href={`/users/${user.id}`}
                  className="flex items-center space-x-2 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                >
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">{user.username}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-2 text-[var(--text-secondary)] hover:text-red-600 transition-colors"
                  title="退出登录"
                  aria-label="退出登录"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRegister}
                  className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
                >
                  注册
                </button>
                <button
                  onClick={handleLogin}
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                >
                  登录
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

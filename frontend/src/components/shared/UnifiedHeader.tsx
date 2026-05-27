'use client';

import Link from 'next/link';
import { Search, User as UserIcon, LogOut, Shield, Moon, Sun, Mail, Bell, Plus, Menu } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';

export interface UnifiedHeaderProps {
  showSearch?: boolean;
  showPostButton?: boolean;
  showMessages?: boolean;
  showNotifications?: boolean;
  showServerCount?: boolean;
  showMobileMenu?: boolean;

  siteName?: string;
  logoUrl?: string;

  user?: any;
  isAuthenticated?: boolean;
  serverCount?: number;
  unreadMessageCount?: number;
  unreadNotificationCount?: number;

  onLogin?: () => void;
  onRegister?: () => void;
  onLogout?: () => void;
  onSearch?: (query: string) => void;
  onPostCreate?: () => void;
  onMobileMenuClick?: () => void;

  notificationDropdownSlot?: React.ReactNode;
  mobileMenuSlot?: React.ReactNode;
}

export function UnifiedHeader({
  showSearch = false,
  showPostButton = false,
  showMessages = false,
  showNotifications = false,
  showServerCount = false,
  showMobileMenu = false,
  siteName = 'Mindustry',
  logoUrl,
  user,
  isAuthenticated = false,
  serverCount = 0,
  unreadMessageCount = 0,
  unreadNotificationCount = 0,
  onLogin,
  onRegister,
  onLogout,
  onSearch,
  onPostCreate,
  onMobileMenuClick,
  notificationDropdownSlot,
  mobileMenuSlot,
}: UnifiedHeaderProps) {
  const { theme, toggle: toggleTheme } = useTheme();

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch((e.target as HTMLInputElement).value);
    }
  };

  return (
    <header className="bg-[var(--bg)] border-b border-[var(--border)] sticky top-0 z-50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt={siteName} className="h-8 object-contain" />
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-xl font-bold text-[var(--primary)]">{siteName}</span>
                <span className="text-xs text-[var(--text-muted)]">(mdtbbs)</span>
              </div>
            )}
          </Link>

          {showSearch && (
            <div className="flex-1 max-w-lg mx-2 sm:mx-4 md:mx-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="搜索..."
                  aria-label="搜索"
                  className="w-full pl-10 pr-4 py-1.5 sm:py-2 bg-[var(--bg-elevated)] text-[var(--text)] rounded-[var(--radius)] border-0 focus:ring-2 focus:ring-[var(--primary)] text-sm placeholder:text-[var(--text-muted)]"
                  onKeyDown={handleSearchKeyDown}
                />
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={toggleTheme}
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              aria-label="切换主题"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {showMobileMenu && onMobileMenuClick && (
              <button
                onClick={onMobileMenuClick}
                className="md:hidden p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                aria-label="菜单"
              >
                <Menu className="w-6 h-6" />
              </button>
            )}

            {isAuthenticated && user ? (
              <>
                {showNotifications && (
                  notificationDropdownSlot || (
                    <Link
                      href="/notifications"
                      className="relative p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                      title="通知"
                    >
                      <Bell className="w-5 h-5" />
                      {unreadNotificationCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                          {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                        </span>
                      )}
                    </Link>
                  )
                )}

                {showMessages && (
                  <Link
                    href="/messages"
                    className="relative p-2 text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                    title="私信"
                  >
                    <Mail className="w-5 h-5" />
                    {unreadMessageCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                        {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                      </span>
                    )}
                  </Link>
                )}

                {showServerCount && (
                  <div className="hidden md:block text-[var(--text-muted)] text-sm">
                    服务器: {serverCount}
                  </div>
                )}

                {showPostButton && onPostCreate && (
                  <Link
                    href="/posts/new"
                    className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
                  >
                    <Plus className="w-4 h-4 inline mr-1" />
                    发帖
                  </Link>
                )}

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
                  <UserIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">{user.username}</span>
                </Link>

                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-2 text-[var(--text-secondary)] hover:text-red-600 transition-colors"
                    title="退出登录"
                    aria-label="退出登录"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3">
                {onRegister && (
                  <button
                    onClick={onRegister}
                    className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
                  >
                    注册
                  </button>
                )}
                {onLogin && (
                  <button
                    onClick={onLogin}
                    className="text-sm text-[var(--text-secondary)] hover:text-[var(--primary)] transition-colors"
                  >
                    登录
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {mobileMenuSlot}
    </header>
  );
}
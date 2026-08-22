"use client";

import Link from "next/link";
import {
  Search,
  User as UserIcon,
  LogOut,
  Moon,
  Sun,
  Mail,
  Bell,
  Plus,
  Menu,
  Users,
} from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { User } from "../types";

export interface UnifiedHeaderProps {
  showSearch?: boolean;
  showPostButton?: boolean;
  showMessages?: boolean;
  showNotifications?: boolean;
  showFriends?: boolean;
  showServerCount?: boolean;
  showMobileMenu?: boolean;

  siteName?: string;
  siteTagline?: string;
  logoUrl?: string;

  user?: User | null;
  isAuthenticated?: boolean;
  serverCount?: number;
  unreadMessageCount?: number;
  unreadNotificationCount?: number;
  unreadFriendRequestCount?: number;

  onLogin?: () => void;
  onRegister?: () => void;
  onLogout?: () => void;
  onSearch?: (query: string) => void;
  onPostCreate?: () => void;
  onMobileMenuClick?: () => void;

  // Slots for custom content
  topNavigationSlot?: React.ReactNode;
  notificationDropdownSlot?: React.ReactNode;
  mobileMenuSlot?: React.ReactNode;
}

export function UnifiedHeader({
  showSearch = false,
  showPostButton = false,
  showMessages = false,
  showNotifications = false,
  showFriends = false,
  showServerCount = false,
  showMobileMenu = false,
  siteName = "",
  siteTagline,
  logoUrl,
  user,
  isAuthenticated = false,
  serverCount = 0,
  unreadMessageCount = 0,
  unreadNotificationCount = 0,
  unreadFriendRequestCount = 0,
  onLogin,
  onRegister,
  onLogout,
  onSearch,
  onPostCreate,
  onMobileMenuClick,
  topNavigationSlot,
  notificationDropdownSlot,
  mobileMenuSlot,
}: UnifiedHeaderProps) {
  const { theme, toggle: toggleTheme } = useTheme();

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSearch) {
      onSearch((e.target as HTMLInputElement).value);
    }
  };

  return (
    <header
      className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)] backdrop-blur-sm"
      style={{ background: "var(--bg)" }}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-5">
            {topNavigationSlot && (
              <div className="min-w-0">{topNavigationSlot}</div>
            )}
          </div>

          {showSearch && (
            <div className="hidden min-w-0 flex-1 lg:block lg:max-w-lg">
              <div className="relative">
                <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  placeholder="搜索帖子、资源、用户..."
                  aria-label="搜索"
                  className="w-full border-0 bg-[var(--bg-elevated)] py-2 pl-10 pr-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--primary)]"
                  onKeyDown={handleSearchKeyDown}
                />
              </div>
            </div>
          )}

          <div className="flex shrink-0 items-center space-x-1 sm:space-x-2">
            <button
              onClick={toggleTheme}
              className="relative rounded-full p-2.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--primary)]"
              title={theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
              aria-label="切换主题"
            >
              <div className="relative z-10">
                {theme === "dark" ? (
                  <Sun className="h-5 w-5 text-[var(--accent)]" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </div>
            </button>

            {showMobileMenu && onMobileMenuClick && (
              <button
                onClick={onMobileMenuClick}
                data-testid="mobile-menu-button"
                className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] lg:hidden"
                aria-label="菜单"
              >
                <Menu className="h-6 w-6" />
              </button>
            )}

            {showSearch && (
              <Link
                href="/search"
                className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--primary)] lg:hidden"
                aria-label="搜索"
              >
                <Search className="h-5 w-5" />
              </Link>
            )}

            {isAuthenticated && user ? (
              <>
                {showNotifications && (
                  <div>
                    {notificationDropdownSlot || (
                      <Link
                        href="/notifications"
                        className="relative p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
                        title="通知"
                      >
                        <span>
                          <Bell className="h-5 w-5" />
                        </span>
                        {unreadNotificationCount > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                            {unreadNotificationCount > 9
                              ? "9+"
                              : unreadNotificationCount}
                          </span>
                        )}
                      </Link>
                    )}
                  </div>
                )}

                {showMessages && (
                  <div>
                    <Link
                      href="/messages"
                      className="relative p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
                      title="私信"
                    >
                      <span>
                        <Mail className="h-5 w-5" />
                      </span>
                      {unreadMessageCount > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                          {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                        </span>
                      )}
                    </Link>
                  </div>
                )}

                {showFriends && (
                  <div>
                    <Link
                      href="/friends"
                      className="relative p-2 text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
                      title="好友"
                    >
                      <span>
                        <Users className="h-5 w-5" />
                      </span>
                      {unreadFriendRequestCount > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                          {unreadFriendRequestCount > 9
                            ? "9+"
                            : unreadFriendRequestCount}
                        </span>
                      )}
                    </Link>
                  </div>
                )}

                {showServerCount && (
                  <div className="hidden text-sm text-[var(--text-muted)] md:block">
                    服务器: <span>{serverCount}</span>
                  </div>
                )}

                {showPostButton && (
                  <div>
                    <Link
                      href="/posts/new"
                      onClick={onPostCreate}
                      className="inline-flex items-center gap-1 bg-[var(--primary)] px-2.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)] sm:px-4"
                    >
                      <span>
                        <Plus className="h-4 w-4" />
                      </span>
                      <span className="hidden sm:inline">发帖</span>
                    </Link>
                  </div>
                )}

                <div>
                  <details className="group relative">
                    <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]">
                      <UserIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">{user.username}</span>
                    </summary>
                    <div className="absolute right-0 top-full z-20 mt-2 min-w-40 border border-[var(--border)] bg-[var(--bg-card)] p-1 shadow-lg">
                      <Link
                        href={`/users/${user.id}`}
                        className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
                      >
                        个人主页
                      </Link>
                      <Link
                        href="/messages"
                        className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
                      >
                        私信
                      </Link>
                      <Link
                        href="/friends"
                        className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
                      >
                        好友
                      </Link>
                      <Link
                        href="/bookmarks"
                        className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
                      >
                        收藏
                      </Link>
                      {user.role === "admin" && (
                        <Link
                          href="/admin"
                          className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
                        >
                          管理后台
                        </Link>
                      )}
                      <Link
                        href="/settings"
                        className="block px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
                      >
                        设置
                      </Link>
                      {onLogout && (
                        <button
                          type="button"
                          onClick={onLogout}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-[var(--bg-hover)]"
                        >
                          <LogOut className="h-4 w-4" />
                          退出登录
                        </button>
                      )}
                    </div>
                  </details>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                {onRegister && (
                  <Link
                    href="/register"
                    className="bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--primary-dark)]"
                  >
                    注册
                  </Link>
                )}
                {onLogin && (
                  <Link
                    href="/login"
                    className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
                  >
                    登录
                  </Link>
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
